import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * ENG-146 — Temps 1 questionnaire adjustments.
 *
 *  1. `esn_profiles.positioning` — new column backing Q5 (positionnement
 *     principal: niche / multi-compétences / généraliste / régie / conseil).
 *     It's the only questionnaire field without an existing column.
 *  2. Rename the three Temps-1 stage codes/titles to business-domain slugs
 *     that read cleanly in the URL (`/onboarding/<code>`). Renaming by old
 *     code keeps `stage_order` (2/3/4) intact and converges both fresh and
 *     already-migrated databases.
 *  3. Re-point `handle_new_user` at the renamed first stage (`company_info`)
 *     so freshly-signed-up users start on the right stage.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS; UPDATEs no-op once renamed; the
 * trigger is replaced wholesale.
 */
export class OnboardingTemps1Adjustments1780000000003 implements MigrationInterface {
  public name = 'OnboardingTemps1Adjustments1780000000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS positioning TEXT`)

    await queryRunner.query(
      `UPDATE onboarding_stage_definitions SET code = 'company_info', title = 'Votre ESN' WHERE code = 'time_1_identity'`,
    )
    await queryRunner.query(
      `UPDATE onboarding_stage_definitions SET code = 'offer_expertise', title = 'Votre offre' WHERE code = 'time_1_company'`,
    )
    await queryRunner.query(
      `UPDATE onboarding_stage_definitions SET code = 'target_market', title = 'Vos cibles' WHERE code = 'time_1_expertise'`,
    )

    // Re-point the signup trigger at the renamed first Temps-1 stage. Body is
    // identical to migration 1780000000002 apart from the stage code.
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
        WHERE code = 'company_info';

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
