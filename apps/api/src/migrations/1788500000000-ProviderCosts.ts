import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Coûts fournisseurs, action par action (D19 — « affiche tout tout », côté
 * backoffice uniquement).
 *
 * `cost_usd` est NULLABLE à dessein : un fournisseur dont le prix unitaire n'est
 * pas renseigné compte ses unités sans prétendre au coût. Un DEFAULT 0 ferait
 * lire « gratuit » là où on ne sait pas — et c'est précisément ce genre de zéro
 * silencieux qui a laissé croire qu'un run coûtait 0,75 €.
 */
export class ProviderCosts1788500000000 implements MigrationInterface {
  public name = 'ProviderCosts1788500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS provider_costs (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID,
        user_id      UUID,
        account_id   UUID,
        run_id       UUID,
        feature      TEXT NOT NULL,
        provider     TEXT NOT NULL,
        operation    TEXT NOT NULL,
        calls        INT NOT NULL DEFAULT 0,
        units        INT NOT NULL DEFAULT 0,
        cost_usd     NUMERIC,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS provider_costs_workspace_time_idx ON provider_costs (workspace_id, created_at DESC)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS provider_costs_provider_idx ON provider_costs (provider)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS provider_costs_feature_idx ON provider_costs (feature)`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
