import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2843.19 (épopée #2843) — le plafond de coût par routine et par utilisateur, BACK-OFFICE
 * seul (c132_credits_implicites : aucun chiffre à l'écran du commercial). Table NEUVE, ajout
 * seulement ; la borne (positive ou nulle) est posée dès la création, avant le code qui écrit.
 */
export class RoutineBudgetCaps1796900101000 implements MigrationInterface {
  name = 'RoutineBudgetCaps1796900101000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS routine_budget_caps (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        routine_key text NOT NULL,
        cost_cap_usd numeric(12, 4) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, routine_key),
        CONSTRAINT routine_budget_caps_cost_cap_usd_check CHECK (cost_cap_usd >= 0)
      )
    `)
    await queryRunner.query(`ALTER TABLE routine_budget_caps ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS routine_budget_caps`)
  }
}
