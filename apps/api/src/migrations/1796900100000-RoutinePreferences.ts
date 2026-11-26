import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2843.13 (épopée #2843) — l'AUTONOMIE et l'OWNER qu'un utilisateur règle sur une routine.
 *
 * Une ligne par (utilisateur, routine) ; ligne absente = le défaut du catalogue. La table est
 * NEUVE (ajout seulement) et sa contrainte d'autonomie est posée dès la création, avant le code
 * qui l'écrit (GA-11/GA-12). `owner_user_id` NULL = l'abonné lui-même.
 */
export class RoutinePreferences1796900100000 implements MigrationInterface {
  name = 'RoutinePreferences1796900100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS routine_preferences (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        routine_key text NOT NULL,
        autonomy text NULL,
        owner_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, routine_key),
        CONSTRAINT routine_preferences_autonomy_check
          CHECK (autonomy IS NULL OR autonomy IN ('n0_inform', 'n1_prepare', 'n4_bounded_auto', 'n5_extended_auto'))
      )
    `)
    await queryRunner.query(`ALTER TABLE routine_preferences ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS routine_preferences`)
  }
}
