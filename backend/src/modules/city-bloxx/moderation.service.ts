import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { boardKey, BoardsService } from './boards.service';
import { GameStore } from './common/game-store.service';
import { gameError, GameWorkerService } from './common/game-worker.service';
import { RunSubmissionRow, RunTicketRow } from './common/rows';
import { ModerationActionDto, ModerationRunsQueryDto } from './moderation.dto';
import { VerifiedRun } from './verification.types';
import { SecurityService } from '../security/security.service';
import { Actor, rows } from '../security/types';

interface ModerationRow {
  run_id: string;
  user_id: string;
  public_id: string | null;
  alias: string | null;
  mode: 'quick' | 'daily';
  config: Record<string, unknown>;
  physics_version: string;
  ruleset_version: string;
  definition_id: string | null;
  date_utc: string | Date | null;
  submission_hash: string;
  end_tick: number;
  state: 'queued' | 'processing' | 'accepted' | 'rejected';
  moderation_state: 'visible' | 'quarantined';
  board_eligible: boolean | null;
  result: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  reject_code: string | null;
  inputs_present: boolean;
  input_count: number | null;
  first_received_at: Date;
  inputs_expires_at: Date;
  verified_at: Date | null;
  updated_at: Date;
}

const formatDateUtc = (d: string | Date | null) =>
  d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : d;

const summaryView = (r: ModerationRow) => ({
  runId: r.run_id,
  userId: r.user_id,
  publicId: r.public_id,
  alias: r.alias,
  mode: r.mode,
  state: r.state,
  moderationState: r.moderation_state,
  physicsVersion: r.physics_version,
  rulesetVersion: r.ruleset_version,
  definitionId: r.definition_id,
  dateUTC: formatDateUtc(r.date_utc),
  endTick: r.end_tick,
  boardEligible: Boolean(r.board_eligible),
  result: r.result,
  metrics: r.metrics,
  rejectCode: r.reject_code,
  inputsPresent: Boolean(r.inputs_present),
  firstReceivedAt: r.first_received_at,
  inputsExpiresAt: r.inputs_expires_at,
  verifiedAt: r.verified_at,
  updatedAt: r.updated_at,
});

const detailView = (r: ModerationRow) => ({
  ...summaryView(r),
  config: r.config,
  submissionHash: r.submission_hash,
  inputCount: r.input_count,
});

const selectModerationSql = `
  SELECT s.run_id, s.user_id, p.public_id, p.alias,
    t.mode, t.config, t.physics_version, t.ruleset_version, t.definition_id, t.date_utc,
    s.submission_hash, s.end_tick, s.state, s.moderation_state, s.board_eligible,
    s.result, s.metrics, s.reject_code,
    (s.inputs IS NOT NULL) AS inputs_present,
    CASE WHEN s.inputs IS NOT NULL THEN jsonb_array_length(s.inputs) ELSE NULL END AS input_count,
    s.first_received_at, s.inputs_expires_at, s.verified_at, s.updated_at
  FROM city_bloxx_run_submissions s
  JOIN city_bloxx_run_tickets t ON t.run_id = s.run_id
  LEFT JOIN city_bloxx_profiles p ON p.user_id = s.user_id
`;

@Injectable()
export class ModerationService {
  constructor(
    private readonly store: GameStore,
    private readonly workers: GameWorkerService,
    private readonly boards: BoardsService,
    private readonly security: SecurityService,
  ) {}

  list(actor: Actor, query: ModerationRunsQueryDto) {
    return this.store.transaction(
      actor,
      ['city_bloxx_moderation:read'],
      async (_repo, tx) => {
        const clauses = ['s.moderation_state = $1'];
        const params: unknown[] = [query.moderationState];
        if (query.state) {
          params.push(query.state);
          clauses.push(`s.state = $${params.length}`);
        }
        if (query.mode) {
          params.push(query.mode);
          clauses.push(`t.mode = $${params.length}`);
        }
        const where = `WHERE ${clauses.join(' AND ')}`;
        const [countRow] = await rows<{ total: string }>(
          tx,
          `SELECT count(*)::text AS total
           FROM city_bloxx_run_submissions s
           JOIN city_bloxx_run_tickets t ON t.run_id = s.run_id
           ${where}`,
          params,
        );
        const listParams = [...params, query.limit, query.offset];
        const found = await rows<ModerationRow>(
          tx,
          `${selectModerationSql} ${where}
           ORDER BY s.first_received_at DESC, s.run_id ASC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          listParams,
        );
        return {
          runs: found.map(summaryView),
          total: Number(countRow?.total ?? 0),
          limit: query.limit,
          offset: query.offset,
        };
      },
      false,
      true,
    );
  }

  detail(actor: Actor, runId: string) {
    return this.store.transaction(
      actor,
      ['city_bloxx_moderation:read'],
      async (_repo, tx) => {
        const [found] = await rows<ModerationRow>(
          tx,
          `${selectModerationSql} WHERE s.run_id = $1`,
          [runId],
        );
        if (!found)
          throw gameError(404, 'GAME_RUN_NOT_FOUND', 'Run submission not found');
        return detailView(found);
      },
      false,
      true,
    );
  }

  private async recomputeUserBoardBest(tx: EntityManager, ticket: RunTicketRow) {
    const key = boardKey(ticket);
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1616))', [
      `city-bloxx:board:${ticket.user_id}:${key}`,
    ]);
    await tx.query(
      'DELETE FROM city_bloxx_leaderboard_entries WHERE user_id = $1 AND board_key = $2 AND run_id = $3',
      [ticket.user_id, key, ticket.run_id],
    );
    const [owner] = await rows<{ ok: boolean }>(
      tx,
      `SELECT (status = 'active' AND deleted_at IS NULL AND email_verified_at IS NOT NULL) AS ok
       FROM users WHERE id = $1`,
      [ticket.user_id],
    );
    if (!owner?.ok) return;
    const candidates = await rows<
      RunTicketRow & {
        result: {
          population: number;
          height: number;
          misses: number;
          durationTicks: number;
        };
        metrics: { body: Record<string, number> };
      }
    >(
      tx,
      `SELECT t.*, s.result, s.metrics
       FROM city_bloxx_run_submissions s
       JOIN city_bloxx_run_tickets t ON t.run_id = s.run_id
       WHERE s.user_id = $1
         AND s.state = 'accepted'
         AND s.moderation_state = 'visible'
         AND s.board_eligible = true
         AND t.mode = $2
         AND t.physics_version = $3
         AND t.ruleset_version = $4
         AND t.date_utc IS NOT DISTINCT FROM $5
         AND t.definition_id IS NOT DISTINCT FROM $6
       ORDER BY s.first_received_at ASC, s.run_id ASC`,
      [
        ticket.user_id,
        ticket.mode,
        ticket.physics_version,
        ticket.ruleset_version,
        ticket.date_utc,
        ticket.definition_id,
      ],
    );
    for (const candidate of candidates) {
      const body = candidate.metrics?.body ?? {};
      const perfectBody = Number(body.perfect ?? 0);
      const bodyPlacements = Object.values(body).reduce((a, b) => a + Number(b ?? 0), 0);
      await this.boards.updateBest(
        tx,
        candidate,
        candidate.result,
        perfectBody,
        bodyPlacements,
      );
    }
  }

  quarantine(actor: Actor, runId: string, dto: ModerationActionDto) {
    return this.store.transaction(
      actor,
      ['city_bloxx_moderation:update'],
      async (_repo, tx) => {
        const [ticket] = await rows<RunTicketRow>(
          tx,
          'SELECT * FROM city_bloxx_run_tickets WHERE run_id = $1 FOR UPDATE',
          [runId],
        );
        const [submission] = await rows<RunSubmissionRow>(
          tx,
          'SELECT * FROM city_bloxx_run_submissions WHERE run_id = $1 FOR UPDATE',
          [runId],
        );
        if (!ticket || !submission)
          throw gameError(404, 'GAME_RUN_NOT_FOUND', 'Run submission not found');

        await tx.query(
          `UPDATE city_bloxx_run_submissions
           SET moderation_state = 'quarantined',
               inputs_expires_at = GREATEST(inputs_expires_at, first_received_at + interval '90 days', now() + interval '90 days'),
               updated_at = now()
           WHERE run_id = $1`,
          [runId],
        );
        await this.recomputeUserBoardBest(tx, ticket);
        await this.security.audit(
          tx,
          actor,
          'city_bloxx.run.quarantine',
          'game_run',
          runId,
          {
            reason: dto.reason,
            previousModerationState: submission.moderation_state,
            mode: ticket.mode,
            boardKey: boardKey(ticket),
          },
        );
        const [updated] = await rows<ModerationRow>(
          tx,
          `${selectModerationSql} WHERE s.run_id = $1`,
          [runId],
        );
        return detailView(updated);
      },
      false,
      true,
    );
  }

  async release(actor: Actor, runId: string, dto: ModerationActionDto) {
    const snapshot = await this.store.transaction(
      actor,
      ['city_bloxx_moderation:update'],
      async (_repo, tx) => {
        const [ticket] = await rows<RunTicketRow>(
          tx,
          'SELECT * FROM city_bloxx_run_tickets WHERE run_id = $1',
          [runId],
        );
        const [submission] = await rows<RunSubmissionRow>(
          tx,
          'SELECT * FROM city_bloxx_run_submissions WHERE run_id = $1',
          [runId],
        );
        if (!ticket || !submission)
          throw gameError(404, 'GAME_RUN_NOT_FOUND', 'Run submission not found');
        if (submission.state !== 'accepted')
          throw gameError(
            409,
            'GAME_MODERATION_NOT_RELEASABLE',
            'Only accepted runs can be released to leaderboards',
          );
        if (!submission.inputs)
          throw gameError(
            409,
            'GAME_MODERATION_INPUTS_EXPIRED',
            'Cannot release run after raw inputs retention expired',
          );
        return { ticket, submission };
      },
      false,
      true,
    );

    const verified = await this.workers.run<VerifiedRun>({
      operation: 'verify',
      request: {
        config: snapshot.ticket.config,
        physicsVersion: snapshot.ticket.physics_version,
        rulesetVersion: snapshot.ticket.ruleset_version,
        inputs: snapshot.submission.inputs,
        endTick: snapshot.submission.end_tick,
      },
    });

    return this.store.transaction(
      actor,
      ['city_bloxx_moderation:update'],
      async (_repo, tx) => {
        const [ticket] = await rows<RunTicketRow>(
          tx,
          'SELECT * FROM city_bloxx_run_tickets WHERE run_id = $1 FOR UPDATE',
          [runId],
        );
        const [submission] = await rows<RunSubmissionRow>(
          tx,
          'SELECT * FROM city_bloxx_run_submissions WHERE run_id = $1 FOR UPDATE',
          [runId],
        );
        if (!ticket || !submission)
          throw gameError(404, 'GAME_RUN_NOT_FOUND', 'Run submission not found');
        if (
          submission.state !== 'accepted' ||
          submission.submission_hash !== snapshot.submission.submission_hash
        )
          throw gameError(
            409,
            'GAME_MODERATION_NOT_RELEASABLE',
            'Run state changed before release could complete',
          );
        if (!submission.inputs)
          throw gameError(
            409,
            'GAME_MODERATION_INPUTS_EXPIRED',
            'Cannot release run after raw inputs retention expired',
          );

        await tx.query(
          `UPDATE city_bloxx_run_submissions
           SET moderation_state = 'visible',
               result = $2,
               metrics = $3,
               board_eligible = $4,
               updated_at = now()
           WHERE run_id = $1`,
          [runId, verified.result, verified.metrics, verified.eligible],
        );

        const [owner] = await rows<{ ok: boolean }>(
          tx,
          `SELECT (status = 'active' AND deleted_at IS NULL AND email_verified_at IS NOT NULL) AS ok
           FROM users WHERE id = $1`,
          [ticket.user_id],
        );
        if (owner?.ok && verified.eligible) {
          await this.boards.updateBest(
            tx,
            ticket,
            verified.result,
            verified.perfectBody,
            verified.bodyPlacements,
          );
        }

        await this.security.audit(
          tx,
          actor,
          'city_bloxx.run.release',
          'game_run',
          runId,
          {
            reason: dto.reason,
            previousModerationState: submission.moderation_state,
            mode: ticket.mode,
            boardKey: boardKey(ticket),
            eligible: verified.eligible,
          },
        );
        const [updated] = await rows<ModerationRow>(
          tx,
          `${selectModerationSql} WHERE s.run_id = $1`,
          [runId],
        );
        return detailView(updated);
      },
      false,
      true,
    );
  }
}
