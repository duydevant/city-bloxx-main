// PostgreSQL BIGINT/NUMERIC values deliberately remain decimal strings at this boundary.
export interface GameProfileRow {
  user_id: string;
  public_id: string;
  alias: string;
  locale: 'en' | 'vi';
  preferences: Record<string, boolean>;
  created_at: Date;
  updated_at: Date;
}
export interface CloudSaveRow {
  user_id: string;
  schema: number;
  revision: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  updated_at: Date;
}
export interface SaveMutationRow {
  user_id: string;
  mutation_id: string;
  request_hash: string;
  committed_revision: string;
  receipt: Record<string, unknown>;
  created_at: Date;
  expires_at: Date;
}
export interface SaveBackupRow {
  id: string;
  user_id: string;
  source: 'local' | 'cloud';
  schema: number;
  revision: string | null;
  raw_payload: string;
  payload_hash: string;
  created_at: Date;
  expires_at: Date;
}
export interface RunTicketRow {
  run_id: string;
  user_id: string;
  client_request_id: string;
  request_hash: string;
  token_hash: string;
  mode: 'quick' | 'daily';
  config: Record<string, unknown>;
  physics_version: string;
  ruleset_version: string;
  definition_id: string | null;
  date_utc: string | Date | null;
  state: 'issued' | 'processing' | 'accepted' | 'rejected' | 'expired';
  submission_hash: string | null;
  lease_id: string | null;
  lease_expires_at: Date | null;
  encrypted_start_response: string | null;
  encryption_key_id: string | null;
  issued_at: Date;
  expires_at: Date;
  updated_at: Date;
}
export interface RunSubmissionRow {
  board_eligible: boolean | null;
  submitter_session_id: string | null;
  submitter_token_version: number | null;
  retry_after: Date;
  run_id: string;
  user_id: string;
  submission_hash: string;
  inputs: { tick: number; sequence: number; fraction: number }[] | null;
  end_tick: number;
  state: 'queued' | 'processing' | 'accepted' | 'rejected';
  moderation_state: 'visible' | 'quarantined';
  result: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  reject_code: string | null;
  first_received_at: Date;
  inputs_expires_at: Date;
  verified_at: Date | null;
  updated_at: Date;
}
export interface LeaderboardEntryRow {
  user_id: string;
  board_key: string;
  run_id: string;
  population: string;
  height: number;
  perfect_body: number;
  body_placements: number;
  perfect_ratio: string;
  misses: number;
  simulation_ticks: number;
  first_received_at: Date;
  updated_at: Date;
}
export interface AnalyticsEventRow {
  event_id: string;
  user_id: string | null;
  anonymous_session_hash: string | null;
  source: 'client' | 'server';
  type: string;
  version: string;
  mode: string | null;
  class_id: string | null;
  properties: Record<string, unknown>;
  server_received_at: Date;
  expires_at: Date;
}

export function decimalRevision(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,18})$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  ) {
    throw new Error('Revision must be a PostgreSQL BIGINT decimal string');
  }
  return value;
}
