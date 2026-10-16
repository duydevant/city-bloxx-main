import { MigrationInterface, QueryRunner } from 'typeorm';

export class CityBloxxVerification1792108800000 implements MigrationInterface {
  name = 'CityBloxxVerification1792108800000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE city_bloxx_run_submissions
      ADD COLUMN submitter_session_id uuid REFERENCES auth_sessions(id) ON DELETE SET NULL,
      ADD COLUMN submitter_token_version integer CHECK(submitter_token_version>=0),
      ADD COLUMN board_eligible boolean,
      ADD COLUMN retry_after timestamptz NOT NULL DEFAULT now();
      CREATE INDEX idx_cb_submissions_retry ON city_bloxx_run_submissions(retry_after,first_received_at)
        WHERE state IN ('queued','processing');
      ALTER TABLE city_bloxx_leaderboard_entries ADD CONSTRAINT cb_board_input_bound CHECK(body_placements<=4096);`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE city_bloxx_leaderboard_entries DROP CONSTRAINT cb_board_input_bound;
      DROP INDEX idx_cb_submissions_retry;
      ALTER TABLE city_bloxx_run_submissions DROP COLUMN retry_after, DROP COLUMN board_eligible,
        DROP COLUMN submitter_token_version, DROP COLUMN submitter_session_id;`);
  }
}
