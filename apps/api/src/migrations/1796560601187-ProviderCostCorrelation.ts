import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3717.7 / #3777 (DEC-4036 Q10, Louis 19/10) — UN identifiant de corrélation
 * traverse l'analyse de compte et Laura : api → ia → journaux, Sentry… et
 * jusqu'à la LIGNE DE COÛT. `provider_costs` disait qui, quoi et combien,
 * jamais « quelle requête » : une facture qui monte ne se recollait pas au
 * journal de la requête qui l'a produite.
 *
 * Aucun nouvel identifiant : c'est le `x-correlation-id` déjà posé par
 * `correlationIdMiddleware` (ou porté par le job BullMQ) et déjà lu par le
 * service IA (`app/middleware/correlation_id.py`).
 *
 * NULLABLE, sans défaut : NULL = ligne écrite avant cette colonne, ou hors de
 * tout contexte — jamais un identifiant inventé. La contrainte est posée AVANT
 * le code qui écrit (GA-11/GA-12) et borne la longueur à
 * `PROVIDER_COST_CORRELATION_MAX` (l'en-tête peut venir d'un client).
 */
export class ProviderCostCorrelation1796560601187 implements MigrationInterface {
  name = 'ProviderCostCorrelation1796560601187'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE provider_costs ADD COLUMN IF NOT EXISTS correlation_id text`)
    await queryRunner.query(`ALTER TABLE provider_costs DROP CONSTRAINT IF EXISTS provider_costs_correlation_id_check`)
    await queryRunner.query(`
      ALTER TABLE provider_costs
        ADD CONSTRAINT provider_costs_correlation_id_check
        CHECK (correlation_id IS NULL OR char_length(correlation_id) <= 128)
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS provider_costs_correlation_idx ON provider_costs (correlation_id) WHERE correlation_id IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS provider_costs_correlation_idx`)
    await queryRunner.query(`ALTER TABLE provider_costs DROP CONSTRAINT IF EXISTS provider_costs_correlation_id_check`)
    await queryRunner.query(`ALTER TABLE provider_costs DROP COLUMN IF EXISTS correlation_id`)
  }
}
