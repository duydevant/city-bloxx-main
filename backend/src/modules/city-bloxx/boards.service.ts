import { Injectable } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { GameStore } from './common/game-store.service';
import { gameError } from './common/game-worker.service';
import { RunTicketRow } from './common/rows';
import { cityBloxxCore as core } from '../../common/city-bloxx-core';
import { digest, InfrastructureService } from '../security/infrastructure.service';
import { Actor, rows } from '../security/types';

const optional = (_: unknown, value: unknown) => value !== undefined;
export class BoardQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
  @ValidateIf(optional)
  @ApiPropertyOptional({ description: 'Opaque live-board cursor' })
  @IsString()
  @MaxLength(2048)
  @Matches(/^[A-Za-z0-9_-]+$/)
  cursor?: string;
  @ApiPropertyOptional({ example: '2026-10-16' })
  @ValidateIf(optional)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateUTC?: string;
  @ApiPropertyOptional()
  @ValidateIf(optional)
  @Matches(/^[a-zA-Z0-9._-]{1,64}$/)
  physicsVersion?: string;
  @ApiPropertyOptional()
  @ValidateIf(optional)
  @Matches(/^[a-zA-Z0-9._-]{1,64}$/)
  rulesetVersion?: string;
  @ApiPropertyOptional()
  @ValidateIf(optional)
  @Matches(/^[a-zA-Z0-9._-]{1,32}$/)
  scheduleVersion?: string;
}
export const boardKey = (
  t: Pick<
    RunTicketRow,
    'mode' | 'physics_version' | 'ruleset_version' | 'date_utc' | 'definition_id'
  >,
) =>
  JSON.stringify(
    t.mode === 'quick'
      ? [t.mode, t.physics_version, t.ruleset_version]
      : [
          t.mode,
          t.physics_version,
          t.ruleset_version,
          // pg decodes DATE as local midnight. Preserve its calendar date,
          // rather than serializing a timestamp (or shifting it through UTC).
          t.date_utc instanceof Date
            ? `${t.date_utc.getFullYear()}-${String(t.date_utc.getMonth() + 1).padStart(2, '0')}-${String(t.date_utc.getDate()).padStart(2, '0')}`
            : t.date_utc,
          t.definition_id,
        ],
  );

// With at most 4096 body inputs, distinct rational rates differ by > 1/4096^2.
// NUMERIC(20,12) therefore preserves exact rational ordering for this domain.
export const boardOrder =
  'population DESC,height DESC,perfect_ratio DESC,misses,simulation_ticks,first_received_at,run_id';
interface BoardRow {
  public_id: string;
  alias: string;
  rank: string;
  run_id: string;
  population: string;
  height: number;
  perfect_body: number;
  body_placements: number;
  perfect_ratio: string;
  misses: number;
  simulation_ticks: number;
  first_received_at: Date;
  received: string;
}
const projection = (r: BoardRow) => ({
  publicId: r.public_id,
  alias: r.alias,
  rank: r.rank,
  population: r.population,
  height: r.height,
  perfectBody: r.perfect_body,
  bodyPlacements: r.body_placements,
  perfectRatio: r.perfect_ratio,
  misses: r.misses,
  simulationTicks: r.simulation_ticks,
  receivedAt: r.received,
});

@Injectable()
export class BoardsService {
  constructor(
    private readonly db: DataSource,
    private readonly store: GameStore,
    private readonly infra: InfrastructureService,
  ) {}
  private key(mode: string, q: BoardQuery) {
    if (
      !['quick', 'daily'].includes(mode) ||
      (mode === 'quick' && (q.dateUTC !== undefined || q.scheduleVersion !== undefined))
    )
      throw gameError(400, 'GAME_BOARD_INVALID', 'Invalid board partition');
    const date = q.dateUTC ?? core.utcDate(Date.now());
    if (mode === 'daily' && !core.isUTCDate(date))
      throw gameError(400, 'GAME_BOARD_INVALID', 'Invalid UTC date');
    return boardKey({
      mode: mode as 'quick' | 'daily',
      physics_version: q.physicsVersion ?? core.PHYSICS_VERSION,
      ruleset_version:
        q.rulesetVersion ??
        (mode === 'daily'
          ? core.resolveDaily(date).rulesetVersion
          : core.RULESET_VERSION),
      date_utc: mode === 'daily' ? date : null,
      definition_id:
        mode === 'daily' ? `${q.scheduleVersion ?? 'daily-v1'}|${date}` : null,
    });
  }
  private async limit(ip: string, maximum = 60, scope = 'board') {
    let n: number;
    try {
      n = Number(
        await this.infra.redis.eval(
          `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`,
          1,
          `city-bloxx:rate:${scope}:${digest(ip)}`,
        ),
      );
    } catch {
      throw gameError(503, 'GAME_RATE_UNAVAILABLE', 'Board limiter unavailable');
    }
    if (n > maximum)
      throw gameError(429, 'GAME_RATE_LIMITED', 'Board request limit reached');
  }
  private ranked = `SELECT e.*,p.public_id,p.alias,row_number() OVER (ORDER BY ${boardOrder
    .split(',')
    .map((x) => 'e.' + x)
    .join(',')})::text AS rank,
    to_char(e.first_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS received
    FROM city_bloxx_leaderboard_entries e JOIN city_bloxx_profiles p USING(user_id)
    JOIN users u ON u.id=e.user_id JOIN city_bloxx_run_submissions s ON s.run_id=e.run_id
    WHERE e.board_key=$1 AND u.status='active' AND u.deleted_at IS NULL
      AND s.state='accepted' AND s.moderation_state='visible'`;
  async list(mode: string, q: BoardQuery, ip: string) {
    const key = this.key(mode, q);
    await this.limit(ip);
    const values: unknown[] = [key];
    let where = '';
    if (q.cursor) {
      let c: unknown;
      try {
        c = JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8'));
      } catch {
        /* rejected below */
      }
      if (
        !Array.isArray(c) ||
        c.length !== 8 ||
        c[0] !== key ||
        typeof c[1] !== 'string' ||
        !/^(0|[1-9]\d{0,18})$/.test(c[1]) ||
        BigInt(c[1]) > 9223372036854775807n ||
        !Number.isInteger(c[2]) ||
        c[2] < 0 ||
        c[2] > 4096 ||
        typeof c[3] !== 'string' ||
        !/^(0\.\d{12}|1\.0{12})$/.test(c[3]) ||
        !Number.isInteger(c[4]) ||
        c[4] < 0 ||
        c[4] > 4096 ||
        !Number.isInteger(c[5]) ||
        c[5] < 1 ||
        c[5] > 432000 ||
        typeof c[6] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(c[6]) ||
        !Number.isFinite(Date.parse(c[6])) ||
        !core.isUTCDate(c[6].slice(0, 10)) ||
        c[6].startsWith('0000') ||
        typeof c[7] !== 'string' ||
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(c[7])
      )
        throw gameError(400, 'GAME_CURSOR_INVALID', 'Cursor does not match this board');
      values.push(...(c.slice(1) as unknown[]));
      where = `WHERE (-population,-height,-perfect_ratio,misses,simulation_ticks,first_received_at,run_id) >
        (-$2::bigint,-$3::integer,-$4::numeric,$5::integer,$6::integer,$7::timestamptz,$8::uuid)`;
    }
    values.push(q.limit + 1);
    const found = await rows<BoardRow>(
      this.db.manager,
      `WITH ranked AS (${this.ranked}) SELECT * FROM ranked ${where}
      ORDER BY ${boardOrder} LIMIT $${values.length}`,
      values,
    );
    const page = found.slice(0, q.limit),
      last = page.at(-1);
    const cursor =
      found.length > q.limit && last
        ? Buffer.from(
            JSON.stringify([
              key,
              last.population,
              last.height,
              last.perfect_ratio,
              last.misses,
              last.simulation_ticks,
              last.received,
              last.run_id,
            ]),
          ).toString('base64url')
        : null;
    return {
      boardKey: key,
      entries: page.map(projection),
      nextCursor: cursor,
      live: true,
    };
  }
  async me(actor: Actor, mode: string, q: BoardQuery) {
    await this.limit(actor.userId, 30, 'board-me');
    if (q.cursor)
      throw gameError(400, 'GAME_CURSOR_INVALID', 'Own standing does not take a cursor');
    const key = this.key(mode, q);
    return this.store.transaction(actor, ['city_bloxx_runs:read'], async (_repo, tx) => {
      const [r] = await rows<BoardRow>(
        tx,
        `WITH ranked AS (${this.ranked}) SELECT * FROM ranked WHERE user_id=$2`,
        [key, actor.userId],
      );
      return { boardKey: key, entry: r ? projection(r) : null, live: true };
    });
  }
  async updateBest(
    tx: EntityManager,
    t: RunTicketRow,
    result: { population: number; height: number; misses: number; durationTicks: number },
    perfect: number,
    body: number,
  ) {
    const key = boardKey(t);
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1616))', [
      `city-bloxx:board:${t.user_id}:${key}`,
    ]);
    await tx.query(
      `INSERT INTO city_bloxx_leaderboard_entries AS current
      (user_id,board_key,run_id,population,height,perfect_body,body_placements,perfect_ratio,misses,simulation_ticks,first_received_at)
      SELECT $1,$2,$3,$4,$5,$6::integer,$7::integer,round(CASE WHEN $7::integer=0 THEN 0::numeric ELSE $6::integer::numeric/$7::integer END,12),$8,$9,
      (SELECT first_received_at FROM city_bloxx_run_submissions WHERE run_id=$3)
      ON CONFLICT(user_id,board_key) DO UPDATE SET run_id=EXCLUDED.run_id,population=EXCLUDED.population,height=EXCLUDED.height,
      perfect_body=EXCLUDED.perfect_body,body_placements=EXCLUDED.body_placements,perfect_ratio=EXCLUDED.perfect_ratio,
      misses=EXCLUDED.misses,simulation_ticks=EXCLUDED.simulation_ticks,first_received_at=EXCLUDED.first_received_at,updated_at=now()
      WHERE (EXCLUDED.population,EXCLUDED.height,EXCLUDED.perfect_ratio,-EXCLUDED.misses,-EXCLUDED.simulation_ticks) >
        (current.population,current.height,current.perfect_ratio,-current.misses,-current.simulation_ticks)
      OR ((EXCLUDED.population,EXCLUDED.height,EXCLUDED.perfect_ratio,EXCLUDED.misses,EXCLUDED.simulation_ticks)=
          (current.population,current.height,current.perfect_ratio,current.misses,current.simulation_ticks)
          AND (EXCLUDED.first_received_at,EXCLUDED.run_id)<(current.first_received_at,current.run_id))`,
      [
        t.user_id,
        key,
        t.run_id,
        result.population,
        result.height,
        perfect,
        body,
        result.misses,
        result.durationTicks,
      ],
    );
  }
}
