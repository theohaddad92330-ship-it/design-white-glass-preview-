import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * ENG-145 — extend `handle_new_user` so the auto-created profile row
 * captures the names and avatar that the API sent through Supabase's
 * `signUp({ options: { data: ... } })` (= `raw_user_meta_data`).
 *
 * Priority order on names:
 *   1. raw_user_meta_data.first_name / last_name (password signup)
 *   2. raw_user_meta_data.full_name split on the first space (OAuth /
 *      Google fills `full_name` only)
 *   3. NULL — the user can edit the profile later
 *
 * Avatar resolves from `avatar_url` then `picture` (Google's alias).
 *
 * The fallback path matters because Google OAuth users skip the BellumAI
 * signup form entirely and only carry the provider-supplied fields.
 */
export class ProfileNamesFromUserMetadata1780000000002 implements MigrationInterface {
  public name = 'ProfileNamesFromUserMetadata1780000000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      DECLARE
        first_stage_id UUID;
        meta_first_name TEXT;
        meta_last_name TEXT;
        meta_full_name TEXT;
        meta_avatar_url TEXT;
        space_pos INTEGER;
      BEGIN
        meta_first_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'first_name'), '');
        meta_last_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'last_name'), '');
        meta_full_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), '');
        meta_avatar_url := COALESCE(
          NULLIF(trim(NEW.raw_user_meta_data ->> 'avatar_url'), ''),
          NULLIF(trim(NEW.raw_user_meta_data ->> 'picture'), '')
        );

        -- OAuth fallback: split full_name on first space when we received
        -- no explicit first_name.
        IF meta_first_name IS NULL AND meta_full_name IS NOT NULL THEN
          space_pos := position(' ' IN meta_full_name);
          IF space_pos > 0 THEN
            meta_first_name := substring(meta_full_name FROM 1 FOR space_pos - 1);
            meta_last_name := COALESCE(
              meta_last_name,
              NULLIF(trim(substring(meta_full_name FROM space_pos + 1)), '')
            );
          ELSE
            meta_first_name := meta_full_name;
          END IF;
        END IF;

        INSERT INTO profiles (user_id, email, first_name, last_name, avatar_url)
        VALUES (NEW.id, NEW.email, meta_first_name, meta_last_name, meta_avatar_url);

        SELECT id INTO first_stage_id
        FROM onboarding_stage_definitions
        WHERE code = 'time_1_identity';

        INSERT INTO user_onboarding_state (user_id, current_stage_id, status)
        VALUES (NEW.id, first_stage_id, 'in_progress');

        RETURN NEW;
      END;
      $$
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
