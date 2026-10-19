import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AnalyticsBatchDto,
  AnalyticsEventItemDto,
  GuestAnalyticsBatchDto,
} from './analytics.dto';
import { GameStore } from './common/game-store.service';
import { gameError } from './common/game-worker.service';
import { cityBloxxCore as core } from '../../common/city-bloxx-core';
import { digest, InfrastructureService } from '../security/infrastructure.service';
import { Actor, rows } from '../security/types';

const FORBIDDEN_PROPERTY_KEYS = new Set([
  'email',
  'password',
  'passwordhash',
  'password_hash',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'token',
  'runtoken',
  'run_token',
  'inputs',
  'userid',
  'user_id',
  'accountid',
  'account_id',
  'sessionid',
  'session_id',
  'cookie',
  'authorization',
  'secret',
]);

function sanitizeProperties(raw?: Record<string, unknown>): Record<string, unknown> {
  if (raw === undefined) return { unverifiedTelemetry: true };
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.getPrototypeOf(raw) !== Object.prototype
  ) {
    throw gameError(
      400,
      'GAME_ANALYTICS_INVALID',
      'Analytics properties must be a plain JSON object',
    );
  }
  const entries = Object.entries(raw);
  if (entries.length > 24) {
    throw gameError(
      400,
      'GAME_ANALYTICS_INVALID',
      'Analytics properties exceed 24 fields',
    );
  }
  const clean: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (
      !/^[a-zA-Z0-9_.-]{1,64}$/.test(key) ||
      FORBIDDEN_PROPERTY_KEYS.has(key.toLowerCase())
    ) {
      throw gameError(
        400,
        'GAME_ANALYTICS_INVALID',
        `Forbidden or invalid analytics property key: ${key}`,
      );
    }
    if (key === 'unverifiedTelemetry') continue;
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      clean[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      if (
        value.length > 256 ||
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
        /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
      ) {
        throw gameError(
          400,
          'GAME_ANALYTICS_INVALID',
          'Analytics string property is too long or resembles PII/token',
        );
      }
      clean[key] = value;
      continue;
    }
    if (
      Array.isArray(value) &&
      value.length <= 16 &&
      value.every(
        (item) =>
          typeof item === 'boolean' ||
          (typeof item === 'number' && Number.isFinite(item)) ||
          (typeof item === 'string' &&
            item.length <= 80 &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)),
      )
    ) {
      clean[key] = value;
      continue;
    }
    throw gameError(
      400,
      'GAME_ANALYTICS_INVALID',
      'Analytics properties must contain only bounded primitives or primitive arrays',
    );
  }
  clean.unverifiedTelemetry = true;
  if (Buffer.byteLength(JSON.stringify(clean), 'utf8') > 4096) {
    throw gameError(
      400,
      'GAME_ANALYTICS_INVALID',
      'Analytics event properties exceed 4 KiB',
    );
  }
  return clean;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly db: DataSource,
    private readonly store: GameStore,
    private readonly infra: InfrastructureService,
  ) {}

  private async rateLimit(keys: string[], maximum: number) {
    for (const key of keys) {
      let count: number;
      try {
        count = Number(
          await this.infra.redis.eval(
            `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`,
            1,
            key,
          ),
        );
      } catch {
        throw gameError(
          503,
          'GAME_RATE_UNAVAILABLE',
          'Analytics rate limiter unavailable',
        );
      }
      if (!Number.isSafeInteger(count) || count < 1) {
        throw gameError(
          503,
          'GAME_RATE_UNAVAILABLE',
          'Analytics rate limiter unavailable',
        );
      }
      if (count > maximum) {
        throw gameError(
          429,
          'GAME_RATE_LIMITED',
          'Analytics batch rate limit reached; retry after 60 seconds',
        );
      }
    }
  }

  private assertTrustedOrigin(originHeader?: string, refererHeader?: string) {
    const allowed = (process.env.AUTH_ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    let candidate = originHeader?.trim();
    if (!candidate && refererHeader) {
      try {
        candidate = new URL(refererHeader).origin;
      } catch {
        candidate = undefined;
      }
    }
    if (!candidate || !allowed.includes(candidate)) {
      throw gameError(
        403,
        'GAME_ORIGIN_FORBIDDEN',
        'Trusted origin required for guest analytics',
      );
    }
  }

  private async insertBatch(
    tx: EntityManager,
    events: AnalyticsEventItemDto[],
    userId: string | null,
    anonymousSessionHash: string | null,
  ) {
    const prepared = events.map((event) => ({
      eventId: event.eventId.toLowerCase(),
      type: event.type,
      version: event.version,
      mode: event.mode ?? null,
      classId: event.classId ?? null,
      properties: sanitizeProperties(event.properties),
    }));
    let accepted = 0;
    let duplicates = 0;
    const seen = new Set<string>();
    for (const item of prepared) {
      if (seen.has(item.eventId)) {
        duplicates++;
        continue;
      }
      seen.add(item.eventId);
      const inserted = await rows<{ event_id: string }>(
        tx,
        `INSERT INTO city_bloxx_analytics_events
         (event_id, user_id, anonymous_session_hash, source, type, version, mode, class_id, properties)
         VALUES ($1, $2, $3, 'client', $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [
          item.eventId,
          userId,
          anonymousSessionHash,
          item.type,
          item.version,
          item.mode,
          item.classId,
          JSON.stringify(item.properties),
        ],
      );
      if (inserted.length === 1) accepted++;
      else duplicates++;
    }
    return {
      accepted,
      duplicates,
      unverifiedTelemetry: true as const,
    };
  }

  async recordAuthenticated(actor: Actor, dto: AnalyticsBatchDto) {
    for (const event of dto.events) sanitizeProperties(event.properties);
    await this.store.transaction(actor, ['city_bloxx_profile:read'], () =>
      Promise.resolve(undefined),
    );
    await this.rateLimit([`city-bloxx:rate:analytics:${actor.userId}`], 30);
    return this.store.transaction(actor, ['city_bloxx_profile:read'], (_repo, tx) =>
      this.insertBatch(tx, dto.events, actor.userId, null),
    );
  }

  async recordGuest(
    dto: GuestAnalyticsBatchDto,
    ip: string,
    origin?: string,
    referer?: string,
  ) {
    this.assertTrustedOrigin(origin, referer);
    for (const event of dto.events) sanitizeProperties(event.properties);
    const sessionHash = digest(dto.anonymousSessionId);
    await this.rateLimit(
      [
        `city-bloxx:rate:guest-analytics:ip:${digest(ip)}`,
        `city-bloxx:rate:guest-analytics:session:${sessionHash}`,
      ],
      30,
    );
    return this.db.transaction(async (tx) => {
      await tx.query(`SET LOCAL lock_timeout = '2s'`);
      await tx.query(`SET LOCAL statement_timeout = '5s'`);
      return this.insertBatch(tx, dto.events, null, sessionHash);
    });
  }

  async catalog(ip: string) {
    await this.rateLimit([`city-bloxx:rate:catalog:${digest(ip)}`], 60);
    return {
      versions: {
        physicsVersion: core.PHYSICS_VERSION,
        rulesetVersion: core.RULESET_VERSION,
        assistRulesetVersion: core.ASSIST_RULESET_VERSION,
        cityRulesetVersion: core.CITY_RULESET_VERSION,
        ratingVersion: core.RATING_VERSION,
        cityRatingVersion: core.CITY_RATING_VERSION,
        saveSchema: core.SAVE_VERSION,
        cosmeticsVersion: 'cosmetics-1',
      },
      buildings: core.BUILDING_IDS.map((id) => ({
        id,
        floors: core.BUILDINGS[id].floors,
        population: core.BUILDINGS[id].population,
        requires: [...core.BUILDINGS[id].requires],
        color: core.BUILDINGS[id].color,
      })),
      cosmetics: core.COSMETIC_CATALOG.map((item) => ({
        id: item.id,
        version: item.version,
        category: item.category,
        classId: item.classId,
        set: item.set,
        rule: item.rule,
        target: item.target,
        available: item.available,
        assets: [...item.assets],
        title: { en: item.title.en, vi: item.title.vi },
      })),
    };
  }
}
