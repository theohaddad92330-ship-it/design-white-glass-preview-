import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les cinq leviers admin de gouvernance de coût par espace — épopée #2975
 * (#2440.83-89). Une ligne par espace, créée à la demande par l'admin ; son
 * absence pour un espace veut dire « aucun réglage », jamais « budget zéro ».
 *
 * `monthly_budget_usd` / `per_member_cap_usd` / `per_action_cap_usd` sont
 * NULLABLES à dessein, même discipline que `provider_costs.cost_usd` : un
 * plafond non renseigné n'est pas un plafond à zéro.
 */
export class WorkspaceBudget1796001513928 implements MigrationInterface {
  public name = 'WorkspaceBudget1796001513928'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_budgets (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id        UUID NOT NULL,
        monthly_budget_usd  NUMERIC,
        per_member_cap_usd  NUMERIC,
        per_action_cap_usd  NUMERIC,
        alert_on_overage    BOOLEAN NOT NULL DEFAULT true,
        block_at_cap        BOOLEAN NOT NULL DEFAULT false,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS workspace_budgets_workspace_id_key ON workspace_budgets (workspace_id)`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
