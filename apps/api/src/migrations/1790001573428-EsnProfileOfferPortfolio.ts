import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Portefeuille de domaines de conseil (DATAFORGE V10, décision D-DF2 du 24/08 —
 * `agent_docs/dataforge-v10-plan.md`).
 *
 * ADDITIF : `offer_domain` (singulier, PDF6 §1) reste en place et reste lu
 * quand le portefeuille est vide — un espace existant ne change PAS de
 * comportement. Les valeurs sont les codes de la taxonomie des 66 domaines
 * (`CONSULTING_DOMAINS`, contrats) ; pas de contrainte CHECK : la liste a 66
 * valeurs et grandira avec le pack — le zod (`esnAnswersSchema.offer_domains`)
 * écarte élément par élément ce qu'il ne connaît pas.
 */
export class EsnProfileOfferPortfolio1790001573428 implements MigrationInterface {
  name = 'EsnProfileOfferPortfolio1790001573428'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS offer_domains text[] NOT NULL DEFAULT '{}'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS offer_domains`)
  }
}
