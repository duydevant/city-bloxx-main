import { HttpException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { GameStore } from './common/game-store.service';
import { gameError, GameWorkerService } from './common/game-worker.service';
import { RunSubmissionRow, RunTicketRow } from './common/rows';
import { RunsService } from './runs.service';
import { VerifiedRun } from './verification.types';
import { SecurityService } from '../security/security.service';
import { Actor, rows } from '../security/types';

type Claimed = { ticket: RunTicketRow; submission: RunSubmissionRow };
@Injectable()
export class VerificationService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private pumping = false;
  private readonly pending = new Set<Promise<void>>();
  readonly enabled = process.env.GAME_VERIFICATION_ENABLED !== 'false';
  constructor(
    private readonly runs: RunsService,
    private readonly workers: GameWorkerService,
    private readonly store: GameStore,
    private readonly boards: BoardsService,
    private readonly security: SecurityService,
  ) {}
  onModuleInit() {
    if (!this.enabled) return;
    this.wake();
    this.timer = setInterval(() => this.wake(), 1000);
    this.timer.unref();
  }
  wake() {
    if (!this.stopped) void this.pump().catch(() => undefined);
  }
  request() {
    if (!this.enabled) return;
    if (this.workers.available() === 0)
      throw gameError(
        503,
        'GAME_WORKER_UNAVAILABLE',
        'Verification busy; submission remains queued',
      );
    this.wake();
  }
  async pump() {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (!this.stopped && this.pending.size < 22 && this.workers.available() > 0) {
        const job = await this.runs.claim();
        if (!job) break;
        if (this.stopped) {
          await this.runs.release(job.ticket.run_id, job.ticket.lease_id);
          break;
        }
        const task = this.process(job).finally(() => {
          this.pending.delete(task);
        });
        this.pending.add(task);
      }
    } finally {
      this.pumping = false;
    }
  }
  async process(job: Claimed) {
    const { ticket: t, submission: s } = job;
    let lost = false,
      renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void this.runs
        .renew(t.run_id, t.lease_id)
        .then((ok) => {
          if (!ok) lost = true;
        })
        .catch(() => {
          lost = true;
        })
        .finally(() => {
          renewing = false;
        });
    }, 3000);
    heartbeat.unref();
    try {
      let verified: VerifiedRun | undefined;
      let reject: string | undefined;
      try {
        verified = await this.workers.run<VerifiedRun>({
          operation: 'verify',
          request: {
            config: t.config,
            physicsVersion: t.physics_version,
            rulesetVersion: t.ruleset_version,
            inputs: s.inputs,
            endTick: s.end_tick,
          },
        });
      } catch (error) {
        if (
          error instanceof HttpException &&
          error.getStatus() === 422 &&
          (error.getResponse() as { errorCode?: string }).errorCode === 'GAME_RUN_INVALID'
        )
          reject = 'GAME_RUN_INVALID';
        else throw error;
      }
      if (!lost && !this.stopped) await this.settle(job, verified, reject);
    } catch {
      // Worker/DB/auth failures remain durable and retryable; no invented terminal score.
      await this.runs.release(t.run_id, t.lease_id, 5).catch(() => false);
    } finally {
      clearInterval(heartbeat);
    }
  }
  async settle(job: Claimed, verified?: VerifiedRun, reject?: string) {
    const { ticket: t, submission: s } = job;
    if (!verified && reject !== 'GAME_RUN_INVALID')
      throw new Error('No computed outcome');
    const actor: Actor = {
      userId: t.user_id,
      sessionId: s.submitter_session_id,
      version: s.submitter_token_version,
    };
    return this.store.transaction(
      actor,
      ['city_bloxx_runs:finish'],
      async (repo, tx) => {
        const current = await repo.ticket(t.run_id, true);
        const submission = await repo.submission(t.run_id);
        const [clock] = await rows<{ now: Date }>(tx, 'SELECT clock_timestamp() AS now');
        if (
          !current ||
          current.state !== 'processing' ||
          current.lease_id !== t.lease_id ||
          current.lease_expires_at <= clock.now ||
          current.expires_at <= clock.now ||
          !submission ||
          submission.state !== 'processing' ||
          submission.submission_hash !== s.submission_hash ||
          submission.submitter_session_id !== actor.sessionId ||
          submission.submitter_token_version !== actor.version
        )
          return false;
        await repo.ensureProfile();
        await tx.query(
          `UPDATE city_bloxx_run_submissions SET state=$2,result=$3,metrics=$4,reject_code=$5,board_eligible=$6,verified_at=now(),updated_at=now()
        WHERE run_id=$1`,
          [
            t.run_id,
            reject ? 'rejected' : 'accepted',
            verified?.result ?? null,
            verified?.metrics ?? null,
            reject ?? null,
            verified?.eligible ?? false,
          ],
        );
        await tx.query(
          `UPDATE city_bloxx_run_tickets SET state=$2,lease_id=NULL,lease_expires_at=NULL,
        encrypted_start_response=NULL,encryption_key_id=NULL,updated_at=now() WHERE run_id=$1`,
          [t.run_id, reject ? 'rejected' : 'accepted'],
        );
        if (verified?.eligible && submission.moderation_state === 'visible')
          await this.boards.updateBest(
            tx,
            current,
            verified.result,
            verified.perfectBody,
            verified.bodyPlacements,
          );
        await this.security.audit(
          tx,
          actor,
          reject ? 'city_bloxx.run.reject' : 'city_bloxx.run.accept',
          'game_run',
          t.run_id,
          {
            mode: t.mode,
            eligible: verified?.eligible ?? false,
            ...(reject ? { errorCode: reject } : {}),
          },
        );
        await this.security.identity(actor, tx);
        const [fence] = await rows<{ valid: boolean }>(
          tx,
          'SELECT clock_timestamp()<$1 AND clock_timestamp()<$2 AS valid',
          [current.lease_expires_at, current.expires_at],
        );
        if (!fence.valid)
          throw gameError(
            503,
            'GAME_LEASE_EXPIRED',
            'Settlement lease expired; retry later',
          );
        return true;
      },
      true,
      true,
    );
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
    while (this.pumping) await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.allSettled(this.pending);
  }
}
