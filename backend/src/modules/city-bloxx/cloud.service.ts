import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GameProfileDto, SaveResolveDto, SaveWriteDto } from './cloud.dto';
import { GameStore } from './common/game-store.service';
import { gameError, GameWorkerService } from './common/game-worker.service';
import { CloudSaveRow, decimalRevision, GameProfileRow } from './common/rows';
import { digest, InfrastructureService } from '../security/infrastructure.service';
import { SecurityService } from '../security/security.service';
import { Actor } from '../security/types';

interface ValidatedSave {
  payload: Record<string, unknown> | null;
  requestHash: string;
  payloadHash: string | null;
  raw: string;
}
const metadata = (save?: CloudSaveRow) =>
  save
    ? {
        revision: save.revision,
        schema: save.schema,
        hash: save.payload_hash,
        updatedAt: save.updated_at,
        compatibility: [1, 2, 3, 4].includes(save.schema) ? 'compatible' : 'incompatible',
      }
    : {
        revision: '0',
        schema: null,
        hash: null,
        updatedAt: null,
        compatibility: 'absent',
      };
const profileView = (p: GameProfileRow) => ({
  publicId: p.public_id,
  alias: p.alias,
  locale: p.locale,
  preferences: p.preferences,
  updatedAt: p.updated_at,
});

@Injectable()
export class CloudService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private cleaning = false;
  constructor(
    private readonly store: GameStore,
    private readonly workers: GameWorkerService,
    private readonly infra: InfrastructureService,
    private readonly security: SecurityService,
    private readonly db: DataSource,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.cleanup().catch(() => undefined);
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      // Bounded batches use expiry indexes; no auth retention or unrelated Redis keys touched.
      for (const table of ['city_bloxx_save_backups', 'city_bloxx_save_mutations']) {
        await this.db.query(
          `DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE expires_at<=now() ORDER BY expires_at LIMIT 500)`,
        );
      }
    } finally {
      this.cleaning = false;
    }
  }
  profile(actor: Actor) {
    return this.store.transaction(actor, ['city_bloxx_profile:read'], async (repo) =>
      profileView(await repo.ensureProfile()),
    );
  }
  patchProfile(actor: Actor, dto: GameProfileDto) {
    return this.store.transaction(
      actor,
      ['city_bloxx_profile:update'],
      async (repo, tx) => {
        const profile = await repo.patchProfile(dto);
        await this.security.audit(
          tx,
          actor,
          'city_bloxx.profile.update',
          'game_profile',
          profile.public_id,
        );
        return profileView(profile);
      },
    );
  }
  read(actor: Actor) {
    return this.store.transaction(actor, ['city_bloxx_save:read'], async (repo) => {
      const save = await repo.save();
      return { ...metadata(save), payload: save?.payload ?? null };
    });
  }
  private async limit(actor: Actor) {
    let count: number;
    try {
      count = Number(
        await this.infra.redis.eval(
          `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`,
          1,
          `city-bloxx:rate:save:${actor.userId}`,
        ),
      );
    } catch {
      throw gameError(503, 'GAME_RATE_UNAVAILABLE', 'Cloud rate limiter unavailable');
    }
    if (!Number.isSafeInteger(count) || count < 1)
      throw gameError(503, 'GAME_RATE_UNAVAILABLE', 'Cloud rate limiter unavailable');
    if (count > 30)
      throw gameError(
        429,
        'GAME_RATE_LIMITED',
        'Cloud write limit reached; retry after 60 seconds',
      );
  }
  async write(actor: Actor, dto: SaveWriteDto | SaveResolveDto) {
    try {
      decimalRevision(dto.expectedRevision);
    } catch {
      throw gameError(
        400,
        'GAME_REVISION_INVALID',
        'Expected revision must be a PostgreSQL BIGINT decimal string',
      );
    }
    // Reject revoked/unauthorized callers before spending worker capacity, then check again at commit.
    await this.store.transaction(
      actor,
      ['city_bloxx_save:write'],
      () => Promise.resolve(undefined),
      true,
    );
    await this.limit(actor);
    const validated = await this.workers.run<ValidatedSave>({
      operation: 'save',
      request: dto,
    });
    return this.store.transaction(
      actor,
      ['city_bloxx_save:write'],
      async (repo, tx) => {
        await repo.lockSave();
        await repo.expireReceipt(dto.mutationId);
        const previous = await repo.saveMutation(dto.mutationId);
        if (previous) {
          if (previous.request_hash !== validated.requestHash)
            throw gameError(
              409,
              'GAME_MUTATION_CONFLICT',
              'Mutation ID already used with a different request',
            );
          return previous.receipt;
        }
        const current = await repo.save();
        const conflict = () =>
          gameError(
            409,
            'GAME_REVISION_CONFLICT',
            'Cloud save changed; choose a snapshot explicitly',
            { latest: metadata(current) },
          );
        if ((current?.revision ?? '0') !== dto.expectedRevision) throw conflict();
        if (current?.revision === '9223372036854775807')
          throw gameError(409, 'GAME_REVISION_EXHAUSTED', 'Cloud revision limit reached');
        const resolve = 'choice' in dto ? dto : undefined;
        if (resolve && !current)
          throw gameError(
            409,
            'GAME_CLOUD_ABSENT',
            'There is no cloud snapshot to resolve',
          );
        // A future cloud schema cannot be overwritten by a client that cannot read it.
        if (
          current &&
          ![1, 2, 3, 4].includes(current.schema) &&
          resolve?.choice !== 'cloud'
        )
          throw gameError(
            409,
            'GAME_SAVE_INCOMPATIBLE',
            'Future cloud snapshot preserved',
            { latest: metadata(current) },
          );
        const payload = resolve?.choice === 'cloud' ? current.payload : validated.payload;
        const schema = resolve?.choice === 'cloud' ? current.schema : 4;
        const hash =
          resolve?.choice === 'cloud' ? current.payload_hash : validated.payloadHash;
        if ((await repo.savePayloadBytes(payload)) > 262144)
          throw gameError(
            413,
            'GAME_SAVE_TOO_LARGE',
            'Normalized database snapshot exceeds 256 KiB',
          );
        const backupIds: string[] = [];
        if (resolve) {
          backupIds.push(
            await repo.backup(
              'local',
              resolve.local.schema,
              null,
              validated.raw,
              digest(validated.raw),
            ),
          );
          const rawCloud = JSON.stringify(current.payload);
          backupIds.push(
            await repo.backup(
              'cloud',
              current.schema,
              current.revision,
              rawCloud,
              digest(rawCloud),
            ),
          );
        }
        const saved = await repo.commitSave(dto.expectedRevision, schema, payload, hash);
        if (!saved) throw conflict();
        const receipt = {
          ...metadata(saved),
          mutationId: dto.mutationId,
          backupIds,
          choice: resolve?.choice ?? null,
        };
        await repo.receipt(
          dto.mutationId,
          validated.requestHash,
          saved.revision,
          receipt,
        );
        await this.security.audit(
          tx,
          actor,
          resolve ? 'city_bloxx.save.resolve' : 'city_bloxx.save.write',
          'game_save',
          actor.userId,
          {
            revision: saved.revision,
            mutationId: dto.mutationId,
            choice: resolve?.choice ?? null,
          },
        );
        return receipt;
      },
      true,
    );
  }
}
