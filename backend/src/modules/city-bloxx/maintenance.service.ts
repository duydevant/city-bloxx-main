import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { InfrastructureService } from '../security/infrastructure.service';
import { SecurityService } from '../security/security.service';
import { rows } from '../security/types';

export interface MaintenanceSweepResult {
  skipped: boolean;
  expiredTickets: number;
  purgedInputs: number;
  deletedBackups: number;
  deletedMutations: number;
  deletedEvents: number;
}

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly security: SecurityService,
    @Optional() private readonly infra?: InfrastructureService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.sweep(false).catch(() => undefined);
    }, 60000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async sweep(auditAlways = false): Promise<MaintenanceSweepResult> {
    if (this.running) {
      return {
        skipped: true,
        expiredTickets: 0,
        purgedInputs: 0,
        deletedBackups: 0,
        deletedMutations: 0,
        deletedEvents: 0,
      };
    }
    this.running = true;
    const lockToken = randomUUID();
    const lockKey = 'city-bloxx:maintenance:lock';
    let redisLocked = false;
    try {
      if (this.infra?.redis) {
        const acquired = await this.infra.redis.set(
          lockKey,
          lockToken,
          'PX',
          30000,
          'NX',
        );
        if (acquired !== 'OK') {
          return {
            skipped: true,
            expiredTickets: 0,
            purgedInputs: 0,
            deletedBackups: 0,
            deletedMutations: 0,
            deletedEvents: 0,
          };
        }
        redisLocked = true;
      }

      return await this.db.transaction(async (tx) => {
        await tx.query(`SET LOCAL lock_timeout = '2s'`);
        await tx.query(`SET LOCAL statement_timeout = '10s'`);
        const [advisory] = await rows<{ acquired: boolean }>(
          tx,
          'SELECT pg_try_advisory_xact_lock(1792022499) AS acquired',
        );
        if (!advisory?.acquired) {
          return {
            skipped: true,
            expiredTickets: 0,
            purgedInputs: 0,
            deletedBackups: 0,
            deletedMutations: 0,
            deletedEvents: 0,
          };
        }

        const expired = await rows<{ run_id: string }>(
          tx,
          `SELECT run_id FROM city_bloxx_run_tickets
           WHERE expires_at <= now() AND state IN ('issued', 'processing')
           ORDER BY expires_at
           FOR UPDATE SKIP LOCKED LIMIT 500`,
        );
        for (const t of expired) {
          await tx.query(
            `UPDATE city_bloxx_run_tickets
             SET state = 'expired',
                 lease_id = NULL,
                 lease_expires_at = NULL,
                 encrypted_start_response = NULL,
                 encryption_key_id = NULL,
                 updated_at = now()
             WHERE run_id = $1`,
            [t.run_id],
          );
          await tx.query(
            `UPDATE city_bloxx_run_submissions
             SET state = 'rejected',
                 reject_code = 'GAME_TICKET_EXPIRED',
                 updated_at = now()
             WHERE run_id = $1 AND state IN ('queued', 'processing')`,
            [t.run_id],
          );
        }

        await tx.query(
          `UPDATE city_bloxx_run_tickets
           SET encrypted_start_response = NULL,
               encryption_key_id = NULL,
               updated_at = now()
           WHERE encrypted_start_response IS NOT NULL
             AND (state IN ('accepted', 'rejected', 'expired') OR expires_at <= now())`,
        );

        const [purged] = await rows<{ count: number }>(
          tx,
          `WITH target AS (
             SELECT run_id FROM city_bloxx_run_submissions
             WHERE inputs IS NOT NULL
               AND state IN ('accepted', 'rejected')
               AND inputs_expires_at <= now()
               AND (moderation_state = 'visible' OR first_received_at <= now() - interval '90 days')
             ORDER BY inputs_expires_at
             FOR UPDATE SKIP LOCKED LIMIT 500
           ), changed AS (
             UPDATE city_bloxx_run_submissions s
             SET inputs = NULL, updated_at = now()
             FROM target
             WHERE s.run_id = target.run_id
             RETURNING s.run_id
           )
           SELECT count(*)::int AS count FROM changed`,
        );

        const deleteExpiredFrom = async (
          table:
            | 'city_bloxx_save_backups'
            | 'city_bloxx_save_mutations'
            | 'city_bloxx_analytics_events',
        ) => {
          const [res] = await rows<{ count: number }>(
            tx,
            `WITH deleted AS (
               DELETE FROM ${table}
               WHERE ctid IN (
                 SELECT ctid FROM ${table}
                 WHERE expires_at <= now()
                 ORDER BY expires_at
                 LIMIT 500
               )
               RETURNING 1
             )
             SELECT count(*)::int AS count FROM deleted`,
          );
          return Number(res?.count ?? 0);
        };

        const deletedBackups = await deleteExpiredFrom('city_bloxx_save_backups');
        const deletedMutations = await deleteExpiredFrom('city_bloxx_save_mutations');
        const deletedEvents = await deleteExpiredFrom('city_bloxx_analytics_events');

        const summary: MaintenanceSweepResult = {
          skipped: false,
          expiredTickets: expired.length,
          purgedInputs: Number(purged?.count ?? 0),
          deletedBackups,
          deletedMutations,
          deletedEvents,
        };
        const totalChanged =
          summary.expiredTickets +
          summary.purgedInputs +
          summary.deletedBackups +
          summary.deletedMutations +
          summary.deletedEvents;

        if (auditAlways || totalChanged > 0) {
          await this.security.audit(
            tx,
            null,
            'city_bloxx.maintenance.sweep',
            'city_bloxx_maintenance',
            undefined,
            { ...summary },
          );
        }

        return summary;
      });
    } finally {
      if (redisLocked && this.infra?.redis) {
        await this.infra.redis
          .eval(
            `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`,
            1,
            lockKey,
            lockToken,
          )
          .catch(() => undefined);
      }
      this.running = false;
    }
  }
}
