import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { GameStore } from './common/game-store.service';
import { gameError } from './common/game-worker.service';
import { RunSubmissionRow, RunTicketRow } from './common/rows';
import { FinishRunDto, StartRunDto } from './runs.dto';
import { TicketCrypto } from './ticket-crypto';
import { cityBloxxCore as core } from '../../common/city-bloxx-core';
import { digest, InfrastructureService } from '../security/infrastructure.service';
import { Actor, rows } from '../security/types';

const view = (t: RunTicketRow, s?: RunSubmissionRow) => ({
  runId: t.run_id,
  mode: t.mode,
  status: t.state,
  issuedAt: t.issued_at,
  expiresAt: t.expires_at,
  firstReceivedAt: s?.first_received_at ?? null,
  result: s?.result ?? null,
  boardEligible: s?.board_eligible ?? null,
  rejectCode: s?.reject_code ?? null,
});

function submissionHash(t: RunTicketRow | undefined, dto: FinishRunDto) {
  if (!t || digest(dto.ticket) !== t.token_hash)
    throw gameError(403, 'GAME_TICKET_OWNER_REQUIRED', 'Own valid ticket required');
  if (
    dto.physicsVersion !== t.physics_version ||
    dto.rulesetVersion !== t.ruleset_version
  )
    throw gameError(409, 'GAME_CONFIG_MISMATCH', 'Ticket versions changed');
  let previous = -1;
  for (const [index, i] of dto.inputs.entries()) {
    if (i.sequence !== index || i.tick <= previous || i.tick >= dto.endTick)
      throw gameError(
        422,
        'GAME_INPUT_SEQUENCE_INVALID',
        'Inputs must be ordered within endTick',
      );
    previous = i.tick;
  }
  return digest(
    JSON.stringify({
      inputs: dto.inputs.map((i) => ({
        tick: i.tick,
        sequence: i.sequence,
        fraction: i.fraction,
      })),
      endTick: dto.endTick,
      physicsVersion: dto.physicsVersion,
      rulesetVersion: dto.rulesetVersion,
    }),
  );
}

@Injectable()
export class RunsService implements OnModuleInit, OnModuleDestroy {
  private readonly crypto = new TicketCrypto();
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly store: GameStore,
    private readonly infra: InfrastructureService,
    private readonly db: DataSource,
  ) {}
  onModuleInit() {
    void this.cleanup().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.cleanup().catch(() => undefined);
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  private async limit(kind: string, owner: string, max: number, requestId = '') {
    let n: number;
    try {
      n = Number(
        await this.infra.redis.eval(
          kind === 'finish'
            ? `
            if redis.call('HEXISTS',KEYS[1],ARGV[1])==1 then return 0 end
            local n=tonumber(redis.call('HGET',KEYS[1],'count') or '0')
            if n>=tonumber(ARGV[2]) then return n+1 end
            redis.call('HSET',KEYS[1],ARGV[1],1,'count',n+1)
            if n==0 then redis.call('EXPIRE',KEYS[1],60) end
            return n+1`
            : `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`,
          1,
          `city-bloxx:rate:${kind}:${owner}`,
          requestId,
          max,
        ),
      );
    } catch {
      throw gameError(503, 'GAME_RATE_UNAVAILABLE', 'Game rate limiter unavailable');
    }
    if (n > max) throw gameError(429, 'GAME_RATE_LIMITED', 'Game request limit reached');
  }
  async today(ip: string) {
    await this.limit('daily', digest(ip), 60);
    const now = new Date();
    return {
      serverTime: now.toISOString(),
      dateUTC: core.utcDate(now.getTime()),
      definition: core.resolveDaily(core.utcDate(now.getTime())),
    };
  }
  async start(actor: Actor, dto: StartRunDto) {
    await this.limit('start', actor.userId, 10);
    return this.store.transaction(
      actor,
      ['city_bloxx_runs:start'],
      async (_repo, tx) => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1515))', [
          `city-bloxx:start:${actor.userId}:${dto.clientRequestId.toLowerCase()}`,
        ]);
        const requestHash = digest(JSON.stringify({ mode: dto.mode }));
        const [old] = await rows<RunTicketRow>(
          tx,
          'SELECT * FROM city_bloxx_run_tickets WHERE user_id=$1 AND client_request_id=$2',
          [actor.userId, dto.clientRequestId],
        );
        const [clock] = await rows<{ now: Date }>(tx, 'SELECT clock_timestamp() AS now');
        if (old) {
          if (old.request_hash !== requestHash)
            throw gameError(409, 'GAME_START_CONFLICT', 'Start request changed');
          if (old.expires_at <= clock.now)
            throw gameError(410, 'GAME_TICKET_EXPIRED', 'Ticket expired');
          if (!old.encrypted_start_response)
            throw gameError(409, 'GAME_RUN_TERMINAL', 'Run already settled');
          return this.crypto.decrypt(
            old.encrypted_start_response,
            old.encryption_key_id,
            `${actor.userId}:${old.run_id}`,
          );
        }
        const runId = randomUUID(),
          ticket = randomBytes(32).toString('base64url');
        const definition =
          dto.mode === 'daily'
            ? core.resolveDaily(core.utcDate(clock.now.getTime()))
            : null;
        const config = definition
          ? {
              seed: definition.seed,
              mode: 'daily',
              assist: false,
              building: definition.classId,
              daily: definition,
            }
          : { seed: randomBytes(4).readInt32BE(), mode: 'quick', assist: false };
        const response = {
          runId,
          ticket,
          config,
          physicsVersion: core.PHYSICS_VERSION,
          rulesetVersion: definition?.rulesetVersion || core.RULESET_VERSION,
          issuedAt: clock.now.toISOString(),
          expiresAt: new Date(clock.now.getTime() + 86400000).toISOString(),
        };
        const encrypted = this.crypto.encrypt(response, `${actor.userId}:${runId}`);
        await tx.query(
          `INSERT INTO city_bloxx_run_tickets(run_id,user_id,client_request_id,request_hash,token_hash,
        mode,config,physics_version,ruleset_version,definition_id,date_utc,encrypted_start_response,encryption_key_id,issued_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            runId,
            actor.userId,
            dto.clientRequestId,
            requestHash,
            digest(ticket),
            dto.mode,
            config,
            response.physicsVersion,
            response.rulesetVersion,
            definition?.id ?? null,
            definition?.dateUTC ?? null,
            encrypted,
            this.crypto.keyId,
            response.issuedAt,
            response.expiresAt,
          ],
        );
        return response;
      },
      true,
    );
  }
  async finish(actor: Actor, dto: FinishRunDto) {
    // Rate only new jobs; polling/idempotent retries do not consume the job budget.
    const existing = await this.store.transaction(
      actor,
      ['city_bloxx_runs:finish'],
      async (repo) => {
        submissionHash(await repo.ticket(dto.runId), dto);
        return repo.submission(dto.runId);
      },
      true,
    );
    if (!existing) await this.limit('finish', actor.userId, 5, dto.runId.toLowerCase());
    return this.store.transaction(
      actor,
      ['city_bloxx_runs:finish'],
      async (repo, tx) => {
        const t = await repo.ticket(dto.runId, true);
        const hash = submissionHash(t, dto);
        const old = await repo.submission(dto.runId);
        if (old) {
          if (old.submission_hash !== hash)
            throw gameError(409, 'GAME_SUBMISSION_CONFLICT', 'Submission changed');
          if (t.state === 'accepted' || t.state === 'rejected') return view(t, old);
        }
        const [clock] = await rows<{ now: Date }>(tx, 'SELECT clock_timestamp() AS now');
        if (t.expires_at <= clock.now || t.state === 'expired')
          throw gameError(410, 'GAME_TICKET_EXPIRED', 'Ticket expired');
        if (old) {
          if (
            old.submitter_session_id !== actor.sessionId ||
            old.submitter_token_version !== actor.version
          ) {
            await tx.query(
              `UPDATE city_bloxx_run_submissions SET submitter_session_id=$2,submitter_token_version=$3,
              state='queued',retry_after=now(),updated_at=now() WHERE run_id=$1`,
              [t.run_id, actor.sessionId, actor.version],
            );
            await tx.query(
              `UPDATE city_bloxx_run_tickets SET lease_id=$2,lease_expires_at=now(),updated_at=now() WHERE run_id=$1`,
              [t.run_id, randomUUID()],
            );
          }
          return view(t, old);
        }
        await tx.query(
          `INSERT INTO city_bloxx_run_submissions(run_id,user_id,submission_hash,inputs,end_tick,submitter_session_id,submitter_token_version)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            t.run_id,
            actor.userId,
            hash,
            JSON.stringify(dto.inputs),
            dto.endTick,
            actor.sessionId,
            actor.version,
          ],
        );
        await tx.query(
          `UPDATE city_bloxx_run_tickets SET state='processing',submission_hash=$2,lease_id=$3,
        lease_expires_at=now()+interval '15 seconds',updated_at=now() WHERE run_id=$1`,
          [t.run_id, hash, randomUUID()],
        );
        return view(await repo.ticket(t.run_id), await repo.submission(t.run_id));
      },
      true,
    );
  }
  async status(actor: Actor, id: string) {
    await this.limit('status', actor.userId, 30);
    return this.store.transaction(actor, ['city_bloxx_runs:read'], async (repo) => {
      const t = await repo.ticket(id);
      if (!t) throw gameError(404, 'GAME_RUN_NOT_FOUND', 'Run not found');
      if (t.expires_at <= new Date() && !['accepted', 'rejected'].includes(t.state))
        return { ...view(t, await repo.submission(id)), status: 'expired' };
      return view(t, await repo.submission(id));
    });
  }
  // Internal worker interface for W1.6: persisted queued jobs survive process loss.
  async claim(runId?: string) {
    return this.db.transaction(async (tx) => {
      const [t] = await rows<RunTicketRow>(
        tx,
        `SELECT t.* FROM city_bloxx_run_tickets t
        JOIN city_bloxx_run_submissions s USING(run_id)
        JOIN users u ON u.id=t.user_id JOIN auth_sessions a ON a.id=s.submitter_session_id AND a.user_id=t.user_id
        WHERE t.state='processing' AND t.expires_at>now() AND s.retry_after<=now() AND ($1::uuid IS NULL OR t.run_id=$1)
        AND u.status='active' AND u.deleted_at IS NULL AND u.email_verified_at IS NOT NULL
        AND u.token_version=s.submitter_token_version AND a.revoked_at IS NULL AND a.expires_at>now()
        AND (EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
          WHERE ur.user_id=t.user_id AND r.code='super_admin' AND r.is_system AND r.is_active)
          OR EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
            JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
            WHERE ur.user_id=t.user_id AND r.is_active AND p.is_active AND p.code='city_bloxx_runs:finish'))
        AND (s.state='queued' OR (s.state='processing' AND t.lease_expires_at<=now()))
        ORDER BY s.first_received_at FOR UPDATE OF t SKIP LOCKED LIMIT 1`,
        [runId ?? null],
      );
      if (!t) return null;
      const leaseId = randomUUID();
      await tx.query(
        `UPDATE city_bloxx_run_tickets SET lease_id=$2,lease_expires_at=now()+interval '15 seconds',updated_at=now() WHERE run_id=$1`,
        [t.run_id, leaseId],
      );
      await tx.query(
        `UPDATE city_bloxx_run_submissions SET state='processing',updated_at=now() WHERE run_id=$1`,
        [t.run_id],
      );
      return {
        ticket: { ...t, lease_id: leaseId },
        submission: (
          await rows<RunSubmissionRow>(
            tx,
            'SELECT * FROM city_bloxx_run_submissions WHERE run_id=$1',
            [t.run_id],
          )
        )[0],
      };
    });
  }
  async renew(runId: string, leaseId: string) {
    const result = await rows<{ run_id: string }>(
      this.db.manager,
      `WITH changed AS (UPDATE city_bloxx_run_tickets SET lease_expires_at=now()+interval '15 seconds',updated_at=now()
      WHERE run_id=$1 AND lease_id=$2 AND state='processing' AND lease_expires_at>now() AND expires_at>now() RETURNING run_id) SELECT * FROM changed`,
      [runId, leaseId],
    );
    return result.length === 1;
  }
  async release(runId: string, leaseId: string, delaySeconds = 0) {
    return this.db.transaction(async (tx) => {
      const claimed = await rows<RunTicketRow>(
        tx,
        `SELECT * FROM city_bloxx_run_tickets WHERE run_id=$1 AND lease_id=$2
        AND state='processing' AND lease_expires_at>now() AND expires_at>now() FOR UPDATE`,
        [runId, leaseId],
      );
      if (!claimed.length) return false;
      await tx.query(
        `UPDATE city_bloxx_run_submissions SET state='queued',retry_after=now()+($2::integer*interval '1 second'),updated_at=now() WHERE run_id=$1`,
        [runId, delaySeconds],
      );
      await tx.query(
        `UPDATE city_bloxx_run_tickets SET lease_id=$2,lease_expires_at=now(),updated_at=now() WHERE run_id=$1`,
        [runId, randomUUID()],
      );
      return true;
    });
  }
  async cleanup() {
    await this.db.transaction(async (tx) => {
      const expired = await rows<{ run_id: string }>(
        tx,
        `SELECT run_id FROM city_bloxx_run_tickets
        WHERE expires_at<=now() AND state IN ('issued','processing') ORDER BY expires_at
        FOR UPDATE SKIP LOCKED LIMIT 500`,
      );
      for (const t of expired) {
        await tx.query(
          `UPDATE city_bloxx_run_tickets SET state='expired',lease_id=NULL,lease_expires_at=NULL,
          encrypted_start_response=NULL,encryption_key_id=NULL,updated_at=now() WHERE run_id=$1`,
          [t.run_id],
        );
        await tx.query(
          `UPDATE city_bloxx_run_submissions SET state='rejected',reject_code='GAME_TICKET_EXPIRED',updated_at=now()
          WHERE run_id=$1 AND state IN ('queued','processing')`,
          [t.run_id],
        );
      }
    });
  }
}
