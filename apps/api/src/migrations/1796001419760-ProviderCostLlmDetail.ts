import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Détail LLM du ledger de coûts (#2440.6/.7/.8/.9/.16/.19).
 *
 * `provider_costs` (migration `1788500000000-ProviderCosts`) trace déjà QUI
 * (workspace/user/account), QUOI (run/feature/provider/operation) et COMBIEN
 * (calls/units/cost_usd) — mais rien du détail propre à un appel de MODÈLE :
 * lequel, combien de jetons en entrée/en sortie, combien servis depuis le
 * cache, si l'appel a abouti, et sur quelle grille de prix le coût a été
 * calculé. `cost_ledger.py` (côté IA) porte maintenant ce détail dans l'en-tête
 * `x-bellum-costs` pour Anthropic ET OpenAI ; ces colonnes lui donnent où
 * atterrir.
 *
 * SAFE : six colonnes NULLABLES sur une table existante, aucune valeur par
 * défaut à deviner. NULL = « pas un appel de modèle » (Firecrawl, Apollo…) OU
 * « ligne écrite avant cette migration » — les deux se lisent pareil, comme
 * `environment` avant elle (`1790900000002-ProviderCostEnvironment`) : jamais
 * un défaut qui gonflerait rétroactivement une ligne qui n'a rien mesuré.
 */
export class ProviderCostLlmDetail1796001419760 implements MigrationInterface {
  name = 'ProviderCostLlmDetail1796001419760'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider_costs
        ADD COLUMN IF NOT EXISTS model text,
        ADD COLUMN IF NOT EXISTS input_tokens integer,
        ADD COLUMN IF NOT EXISTS output_tokens integer,
        ADD COLUMN IF NOT EXISTS cache_read_tokens integer,
        ADD COLUMN IF NOT EXISTS cache_creation_tokens integer,
        ADD COLUMN IF NOT EXISTS status text,
        ADD COLUMN IF NOT EXISTS tariff_version text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider_costs
        DROP COLUMN IF EXISTS tariff_version,
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS cache_creation_tokens,
        DROP COLUMN IF EXISTS cache_read_tokens,
        DROP COLUMN IF EXISTS output_tokens,
        DROP COLUMN IF EXISTS input_tokens,
        DROP COLUMN IF EXISTS model
    `)
  }
}
