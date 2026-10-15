import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import {
  CloudSaveRow,
  GameProfileRow,
  RunSubmissionRow,
  RunTicketRow,
  SaveMutationRow,
} from './rows';
import { rows } from '../../security/types';

// Every instance belongs to one actor and one active transaction; no fallback global manager.
export class GameRepository {
  constructor(
    private readonly tx: EntityManager,
    private readonly ownerId: string,
  ) {
    if (!tx.queryRunner?.isTransactionActive)
      throw new Error('Game repository requires an active transaction');
  }
  async profile() {
    const [profile] = await rows<GameProfileRow>(
      this.tx,
      'SELECT * FROM city_bloxx_profiles WHERE user_id=$1',
      [this.ownerId],
    );
    return profile;
  }
  async ensureProfile() {
    await this.tx.query(
      `INSERT INTO city_bloxx_profiles(user_id,public_id,alias) VALUES($1,$2,'Builder') ON CONFLICT(user_id) DO NOTHING`,
      [this.ownerId, randomUUID()],
    );
    return this.profile();
  }
  async patchProfile(patch: { alias?: string; locale?: string; preferences?: object }) {
    await this.ensureProfile();
    const [profile] = await rows<GameProfileRow>(
      this.tx,
      `WITH changed AS (UPDATE city_bloxx_profiles SET alias=COALESCE($2,alias),locale=COALESCE($3,locale),preferences=preferences||$4::jsonb,updated_at=now() WHERE user_id=$1 RETURNING *) SELECT * FROM changed`,
      [this.ownerId, patch.alias ?? null, patch.locale ?? null, patch.preferences ?? {}],
    );
    return profile;
  }
  async lockSave() {
    // Serializes even the first insert and receipt retry. Hash collisions only serialize unrelated owners.
    await this.tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 1313))`, [
      `city-bloxx:save:${this.ownerId}`,
    ]);
  }
  async savePayloadBytes(payload: object): Promise<number> {
    const [row] = await rows<{ bytes: number }>(
      this.tx,
      'SELECT octet_length($1::jsonb::text) AS bytes',
      [JSON.stringify(payload)],
    );
    return row.bytes;
  }
  async commitSave(expected: string, schema: number, payload: object, hash: string) {
    const [save] = await rows<CloudSaveRow>(
      this.tx,
      `INSERT INTO city_bloxx_saves(user_id,schema,revision,payload,payload_hash)
       SELECT $1,$3,1,$4,$5 WHERE $2::bigint=0
       ON CONFLICT(user_id) DO NOTHING RETURNING *`,
      [this.ownerId, expected, schema, JSON.stringify(payload), hash],
    );
    if (save) return save;
    const [updated] = await rows<CloudSaveRow>(
      this.tx,
      `WITH changed AS (UPDATE city_bloxx_saves SET schema=$3,revision=revision+1,payload=$4,payload_hash=$5,updated_at=now() WHERE user_id=$1 AND revision=$2::bigint RETURNING *) SELECT * FROM changed`,
      [this.ownerId, expected, schema, JSON.stringify(payload), hash],
    );
    return updated;
  }
  async backup(
    source: 'local' | 'cloud',
    schema: number,
    revision: string | null,
    raw: string,
    hash: string,
  ) {
    const id = randomUUID();
    await this.tx.query(
      `INSERT INTO city_bloxx_save_backups(id,user_id,source,schema,revision,raw_payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [id, this.ownerId, source, schema, revision, raw, hash],
    );
    return id;
  }
  async receipt(
    mutationId: string,
    requestHash: string,
    revision: string,
    receipt: object,
  ) {
    await this.tx.query(
      `INSERT INTO city_bloxx_save_mutations(user_id,mutation_id,request_hash,committed_revision,receipt) VALUES($1,$2,$3,$4,$5)`,
      [this.ownerId, mutationId, requestHash, revision, receipt],
    );
  }
  async expireReceipt(mutationId: string) {
    await this.tx.query(
      'DELETE FROM city_bloxx_save_mutations WHERE user_id=$1 AND mutation_id=$2 AND expires_at<=now()',
      [this.ownerId, mutationId],
    );
  }
  async save() {
    const [save] = await rows<CloudSaveRow>(
      this.tx,
      'SELECT * FROM city_bloxx_saves WHERE user_id=$1',
      [this.ownerId],
    );
    return save;
  }
  async saveMutation(mutationId: string) {
    const [receipt] = await rows<SaveMutationRow>(
      this.tx,
      'SELECT * FROM city_bloxx_save_mutations WHERE user_id=$1 AND mutation_id=$2',
      [this.ownerId, mutationId],
    );
    return receipt;
  }
  async ticket(runId: string, lock = false) {
    const [ticket] = await rows<RunTicketRow>(
      this.tx,
      `SELECT * FROM city_bloxx_run_tickets WHERE user_id=$1 AND run_id=$2${lock ? ' FOR UPDATE' : ''}`,
      [this.ownerId, runId],
    );
    return ticket;
  }
  async submission(runId: string) {
    const [submission] = await rows<RunSubmissionRow>(
      this.tx,
      'SELECT * FROM city_bloxx_run_submissions WHERE user_id=$1 AND run_id=$2',
      [this.ownerId, runId],
    );
    return submission;
  }
}
