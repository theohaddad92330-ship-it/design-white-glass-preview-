import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * ENG-147 — Onboarding + profile persistence redesign.
 *
 * Replaces the legacy `profiles` (id auto + onboarding_data JSONB) by a
 * normalized model:
 *   - profiles                      identity (id = auth.users.id, email, name)
 *   - onboarding_stage_definitions  fixed catalog of onboarding stage codes
 *   - user_onboarding_state         where each user currently sits in the flow
 *   - esn_profiles                  versioned BellumAI questionnaire answers
 *
 * The legacy `handle_new_user` trigger is rewritten to seed the new identity
 * row and an initial onboarding state pointing at `time_1_identity`.
 *
 * The `search_path` clause is preserved on the trigger function: GoTrue
 * fires it as `supabase_auth_admin` (default search_path `auth, extensions`),
 * so `public` must be pinned explicitly.
 */
export class OnboardingProfilesSchema1780000000000 implements MigrationInterface {
  public name = 'OnboardingProfilesSchema1780000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const enableUserScopedRls = async (table: string, column: 'id' | 'user_id'): Promise<void> => {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      for (const op of ['select', 'insert', 'update', 'delete'] as const) {
        const clause = op === 'insert' ? 'WITH CHECK' : 'USING'
        await queryRunner.query(
          `CREATE POLICY "${table}_${op}" ON ${table} FOR ${op.toUpperCase()} ${clause} (auth.uid() = ${column})`,
        )
      }
    }

    const addUpdatedAtTrigger = async (table: string): Promise<void> => {
      await queryRunner.query(`
        CREATE TRIGGER ${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
      `)
    }

    // ─── Tear down the legacy profiles table + its trigger ──────────────
    // CASCADE on the function drop removes any auth.users trigger pointing
    // at handle_new_user (the canonical name is on_auth_user_created_profile
    // from Init, but some environments have a trigger called
    // on_auth_user_created from earlier manual fixes — CASCADE cleans both).
    await queryRunner.query(`DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users`)
    await queryRunner.query(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`)
    await queryRunner.query(`DROP FUNCTION IF EXISTS handle_new_user() CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS profiles CASCADE`)

    // Idempotency: a partial run on a dev DB may have left these tables
    // behind (the surrounding transaction rolls back DDL, but some local
    // environments are restored from snapshots or hand-edited between runs).
    await queryRunner.query(`DROP TABLE IF EXISTS esn_profiles CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS user_onboarding_state CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS onboarding_stage_definitions CASCADE`)

    // ─── 1. profiles — identity row, PK = user_id FK to auth.users ──────
    // `user_id` is the natural key (one row per auth user). `id` is an
    // additional public-facing surrogate, generated automatically — useful
    // for any future "shareable user reference" we don't want to leak as
    // the auth UUID.
    await queryRunner.query(`
      CREATE TABLE profiles (
        id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT UNIQUE,
        first_name TEXT,
        last_name TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await enableUserScopedRls('profiles', 'user_id')
    await addUpdatedAtTrigger('profiles')

    await queryRunner.query(`
      COMMENT ON TABLE profiles IS
        'BellumAI identity row, one-to-one with auth.users via user_id. auth.users stays the source of credentials; profiles carries the app-owned identity fields (email mirror, first/last name, avatar).'
    `)
    await queryRunner.query(
      `COMMENT ON COLUMN profiles.user_id IS 'Equal to auth.users.id; cascades on auth deletion.'`,
    )

    // ─── 2. onboarding_stage_definitions — fixed catalog ────────────────
    await queryRunner.query(`
      CREATE TABLE onboarding_stage_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        stage_order INTEGER NOT NULL UNIQUE,
        is_required BOOLEAN NOT NULL DEFAULT true
      )
    `)

    await queryRunner.query(`
      INSERT INTO onboarding_stage_definitions (code, title, stage_order) VALUES
        ('signup', 'Création de compte', 1),
        ('time_1_identity', 'Identité', 2),
        ('time_1_company', 'Entreprise', 3),
        ('time_1_expertise', 'Expertises', 4),
        ('transition_summary', 'Récapitulatif', 5),
        ('time_2_profiles', 'Profils cibles', 6),
        ('time_2_go_to_market', 'Stratégie commerciale', 7),
        ('completed', 'Onboarding terminé', 8)
    `)

    // Catalog table: readable by every authenticated session, never mutated
    // through user-scoped JWTs (only the service/postgres role writes).
    await queryRunner.query(`ALTER TABLE onboarding_stage_definitions ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `CREATE POLICY "onboarding_stage_definitions_select" ON onboarding_stage_definitions FOR SELECT USING (true)`,
    )

    await queryRunner.query(`
      COMMENT ON TABLE onboarding_stage_definitions IS
        'Fixed catalog of onboarding stages. Seeded by migration; mutated only by service-role connections.'
    `)

    // ─── 3. user_onboarding_state — current stage per user ──────────────
    await queryRunner.query(`
      CREATE TABLE user_onboarding_state (
        user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        current_stage_id UUID REFERENCES onboarding_stage_definitions(id),
        status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await enableUserScopedRls('user_onboarding_state', 'user_id')
    await addUpdatedAtTrigger('user_onboarding_state')

    await queryRunner.query(`
      COMMENT ON TABLE user_onboarding_state IS
        'Where each user currently sits in the onboarding flow. One row per user; current_stage_id points at the catalog row to resume on.'
    `)

    // ─── 4. esn_profiles — versioned BellumAI questionnaire ────────────
    await queryRunner.query(`
      CREATE TABLE esn_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        is_current BOOLEAN NOT NULL DEFAULT true,
        esn_name TEXT,
        consultant_size TEXT,
        expertise_areas TEXT[] NOT NULL DEFAULT '{}',
        target_sectors TEXT[] NOT NULL DEFAULT '{}',
        target_company_types TEXT[] NOT NULL DEFAULT '{}',
        geo_zones TEXT[] NOT NULL DEFAULT '{}',
        placed_roles TEXT[] NOT NULL DEFAULT '{}',
        decision_maker_personas TEXT[] NOT NULL DEFAULT '{}',
        outreach_channels TEXT[] NOT NULL DEFAULT '{}',
        known_competitors TEXT[] NOT NULL DEFAULT '{}',
        support_preferences TEXT[] NOT NULL DEFAULT '{}',
        sales_team_size TEXT,
        staffing_model TEXT,
        main_sales_pain TEXT,
        available_consultants_band TEXT,
        avg_sales_cycle TEXT,
        target_accounts_maturity TEXT,
        social_proof_level TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, version)
      )
    `)

    // At most one current version per user. Allows the API to flip the
    // previous "current" row to false in the same transaction as inserting
    // the new version.
    await queryRunner.query(`
      CREATE UNIQUE INDEX esn_profiles_current_idx
      ON esn_profiles (user_id)
      WHERE is_current = true
    `)

    await enableUserScopedRls('esn_profiles', 'user_id')
    await addUpdatedAtTrigger('esn_profiles')

    await queryRunner.query(`
      COMMENT ON TABLE esn_profiles IS
        'Versioned BellumAI questionnaire snapshots describing the ESN and its go-to-market. Exactly one row per user has is_current = true (enforced by esn_profiles_current_idx); earlier versions are kept for history.'
    `)

    // ─── Auto-seed identity + onboarding state on signup ────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      DECLARE
        first_stage_id UUID;
      BEGIN
        INSERT INTO profiles (user_id, email) VALUES (NEW.id, NEW.email);

        SELECT id INTO first_stage_id
        FROM onboarding_stage_definitions
        WHERE code = 'time_1_identity';

        INSERT INTO user_onboarding_state (user_id, current_stage_id, status)
        VALUES (NEW.id, first_stage_id, 'in_progress');

        RETURN NEW;
      END;
      $$
    `)

    await queryRunner.query(`
      CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user()
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
