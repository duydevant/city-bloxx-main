import { MigrationInterface, QueryRunner } from 'typeorm';

export class CityBloxxSchema1792022400000 implements MigrationInterface {
  name = 'CityBloxxSchema1792022400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE city_bloxx_profiles (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        public_id uuid NOT NULL UNIQUE,
        alias varchar(24) NOT NULL CHECK(char_length(alias) BETWEEN 2 AND 24 AND alias !~ '[[:cntrl:]<>]'),
        locale varchar(5) NOT NULL DEFAULT 'en' CHECK(locale IN ('en','vi')),
        preferences jsonb NOT NULL DEFAULT '{}' CHECK(
          jsonb_typeof(preferences)='object' AND
          preferences - ARRAY['soundEnabled','musicEnabled','reducedMotion']::text[] = '{}'::jsonb AND
          (NOT preferences ? 'soundEnabled' OR jsonb_typeof(preferences->'soundEnabled')='boolean') AND
          (NOT preferences ? 'musicEnabled' OR jsonb_typeof(preferences->'musicEnabled')='boolean') AND
          (NOT preferences ? 'reducedMotion' OR jsonb_typeof(preferences->'reducedMotion')='boolean')
        ),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE city_bloxx_saves (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        schema integer NOT NULL CHECK(schema>0),
        revision bigint NOT NULL CHECK(revision>0),
        payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=262144),
        payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE city_bloxx_save_mutations (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mutation_id uuid NOT NULL,
        request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
        committed_revision bigint NOT NULL CHECK(committed_revision>0),
        receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
        PRIMARY KEY(user_id,mutation_id), CHECK(expires_at>created_at)
      );
      CREATE INDEX idx_cb_save_mutations_expiry ON city_bloxx_save_mutations(expires_at);
      CREATE TABLE city_bloxx_save_backups (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source varchar(10) NOT NULL CHECK(source IN ('local','cloud')),
        schema integer NOT NULL CHECK(schema>0), revision bigint CHECK(revision>=0),
        raw_payload text NOT NULL CHECK(octet_length(raw_payload)<=262144),
        payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days', CHECK(expires_at>created_at)
      );
      CREATE INDEX idx_cb_backups_owner_date ON city_bloxx_save_backups(user_id,created_at DESC);
      CREATE INDEX idx_cb_backups_expiry ON city_bloxx_save_backups(expires_at);
      CREATE TABLE city_bloxx_run_tickets (
        run_id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_request_id uuid NOT NULL, request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
        token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
        mode varchar(10) NOT NULL CHECK(mode IN ('quick','daily')),
        config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
        physics_version varchar(64) NOT NULL, ruleset_version varchar(64) NOT NULL,
        definition_id varchar(128), date_utc date,
        state varchar(16) NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','processing','accepted','rejected','expired')),
        submission_hash char(64) CHECK(submission_hash ~ '^[0-9a-f]{64}$'),
        lease_id uuid, lease_expires_at timestamptz,
        encrypted_start_response text, encryption_key_id varchar(64),
        issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id,client_request_id), UNIQUE(run_id,user_id), CHECK(expires_at>issued_at),
        CHECK((mode='quick' AND date_utc IS NULL AND definition_id IS NULL) OR
          (mode='daily' AND date_utc IS NOT NULL AND definition_id IS NOT NULL)),
        CHECK((state='processing' AND lease_id IS NOT NULL AND lease_expires_at IS NOT NULL) OR
          (state<>'processing' AND lease_id IS NULL AND lease_expires_at IS NULL)),
        CHECK((encrypted_start_response IS NULL)=(encryption_key_id IS NULL)),
        CHECK(state NOT IN ('accepted','rejected','expired') OR encrypted_start_response IS NULL)
      );
      CREATE INDEX idx_cb_tickets_owner_date ON city_bloxx_run_tickets(user_id,issued_at DESC);
      CREATE INDEX idx_cb_tickets_expiry ON city_bloxx_run_tickets(expires_at) WHERE state IN ('issued','processing');
      CREATE INDEX idx_cb_tickets_lease ON city_bloxx_run_tickets(lease_expires_at) WHERE state='processing';
      CREATE TABLE city_bloxx_run_submissions (
        run_id uuid PRIMARY KEY, user_id uuid NOT NULL,
        submission_hash char(64) NOT NULL CHECK(submission_hash ~ '^[0-9a-f]{64}$'),
        inputs jsonb CHECK(jsonb_typeof(inputs)='array' AND jsonb_array_length(inputs)<=4096),
        end_tick integer NOT NULL CHECK(end_tick BETWEEN 1 AND 432000),
        state varchar(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','accepted','rejected')),
        moderation_state varchar(16) NOT NULL DEFAULT 'visible' CHECK(moderation_state IN ('visible','quarantined')),
        result jsonb CHECK(jsonb_typeof(result)='object'), metrics jsonb CHECK(jsonb_typeof(metrics)='object'),
        reject_code varchar(64), first_received_at timestamptz NOT NULL DEFAULT now(),
        inputs_expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
        verified_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(run_id,user_id),
        FOREIGN KEY(run_id,user_id) REFERENCES city_bloxx_run_tickets(run_id,user_id) ON DELETE CASCADE,
        CHECK(state NOT IN ('queued','processing') OR inputs IS NOT NULL),
        CHECK(state<>'accepted' OR (result IS NOT NULL AND metrics IS NOT NULL AND verified_at IS NOT NULL)),
        CHECK(inputs_expires_at>first_received_at)
      );
      CREATE INDEX idx_cb_submissions_inputs_expiry ON city_bloxx_run_submissions(inputs_expires_at) WHERE inputs IS NOT NULL;
      CREATE INDEX idx_cb_submissions_moderation ON city_bloxx_run_submissions(moderation_state,first_received_at DESC);
      CREATE FUNCTION city_bloxx_keep_received_at() RETURNS trigger LANGUAGE plpgsql AS $body$
        BEGIN
          IF NEW.first_received_at IS DISTINCT FROM OLD.first_received_at THEN
            RAISE EXCEPTION 'first_received_at is immutable' USING ERRCODE='23514';
          END IF;
          RETURN NEW;
        END;
      $body$;
      CREATE TRIGGER cb_submission_received_at BEFORE UPDATE ON city_bloxx_run_submissions
        FOR EACH ROW EXECUTE FUNCTION city_bloxx_keep_received_at();
      CREATE TABLE city_bloxx_leaderboard_entries (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        board_key varchar(256) NOT NULL CHECK(char_length(board_key)>0), run_id uuid NOT NULL,
        population bigint NOT NULL CHECK(population>=0), height integer NOT NULL CHECK(height>=0),
        perfect_body integer NOT NULL CHECK(perfect_body>=0), body_placements integer NOT NULL CHECK(body_placements>=perfect_body),
        perfect_ratio numeric(20,12) NOT NULL CHECK(perfect_ratio BETWEEN 0 AND 1),
        misses integer NOT NULL CHECK(misses>=0), simulation_ticks integer NOT NULL CHECK(simulation_ticks BETWEEN 1 AND 432000),
        first_received_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id,board_key),
        FOREIGN KEY(run_id,user_id) REFERENCES city_bloxx_run_submissions(run_id,user_id) ON DELETE CASCADE,
        CHECK(perfect_ratio=round(CASE WHEN body_placements=0 THEN 0::numeric ELSE perfect_body::numeric/body_placements END,12))
      );
      CREATE INDEX idx_cb_board_order ON city_bloxx_leaderboard_entries(
        board_key,population DESC,height DESC,perfect_ratio DESC,misses,simulation_ticks,first_received_at,run_id
      );
      CREATE TABLE city_bloxx_analytics_events (
        event_id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        anonymous_session_hash char(64) CHECK(anonymous_session_hash ~ '^[0-9a-f]{64}$'),
        source varchar(10) NOT NULL DEFAULT 'client' CHECK(source IN ('client','server')),
        type varchar(64) NOT NULL CHECK(type IN ('session_start','mode_start','run_finish','retry','city_accept',
          'daily_attempt','daily_complete','mission_claim','cosmetic_unlock','cosmetic_equip','save_error','load_timing','verification_reject')),
        version varchar(64) NOT NULL, mode varchar(10) CHECK(mode IN ('quick','city','daily')),
        class_id varchar(16) CHECK(class_id IN ('residential','industrial','office','highrise')),
        properties jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(properties)='object' AND octet_length(properties::text)<=8192 AND
          NOT properties ?| ARRAY['email','password','accessToken','refreshToken','inputs','userId','accountId']),
        server_received_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
        CHECK((user_id IS NOT NULL AND anonymous_session_hash IS NULL) OR (user_id IS NULL AND anonymous_session_hash IS NOT NULL)),
        CHECK(type<>'verification_reject' OR source='server'), CHECK(expires_at>server_received_at)
      );
      CREATE INDEX idx_cb_events_expiry ON city_bloxx_analytics_events(expires_at);
      CREATE INDEX idx_cb_events_owner_date ON city_bloxx_analytics_events(user_id,server_received_at DESC) WHERE user_id IS NOT NULL;
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    // Disposable migration rehearsal only; deployed game data is not automatically rolled back.
    await q.query(`DROP TABLE city_bloxx_analytics_events, city_bloxx_leaderboard_entries,
      city_bloxx_run_submissions, city_bloxx_run_tickets, city_bloxx_save_backups,
      city_bloxx_save_mutations, city_bloxx_saves, city_bloxx_profiles;
      DROP FUNCTION city_bloxx_keep_received_at();`);
  }
}
