import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2053.3 / #2053.4 — le coût d'intercontrat, puis la visibilité et le délai
 * d'encaissement déclarés à l'accueil.
 *
 * Trois colonnes TEXT nullable, additives : `intercontrat_cost` (un montant
 * mensuel, jamais un pourcentage — voir `answers-profil.ts`), et
 * `payment_delay_visibility` / `payment_delay_band` (le suit-il déjà, et
 * où ; le délai lui-même, posé uniquement quand la visibilité le permet).
 * Un profil qui ne répond à rien reste exactement ce qu'il était.
 */
export class IntercontratCostAndPaymentDelay1795698408511 implements MigrationInterface {
  name = 'IntercontratCostAndPaymentDelay1795698408511'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS intercontrat_cost text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS payment_delay_visibility text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS payment_delay_band text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS intercontrat_cost;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS payment_delay_visibility;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS payment_delay_band;
    `)
  }
}
