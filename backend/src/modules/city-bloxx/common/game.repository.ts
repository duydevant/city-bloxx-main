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
