import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3753 — importer un ciblage déjà fait (tier A/B/C, raison, problématiques).
 *
 *  · `tier_label` : la LETTRE du tier de l'ESN, gardée telle quelle (la
 *    priorité `high/medium/low` en est la projection, pas la source). `NULL` =
 *    aucun tier = aucune ligne affichée. La contrainte CHECK vit ICI, dans la
 *    même migration que la colonne (GA-11 / GA-12).
 *  · `seller_hypotheses` : problématiques adressables et projets IT à venir,
 *    FOURNIS par l'ESN et NON VÉRIFIÉS. Lues par la phase 1 de l'analyse du
 *    compte, qui les injecte étiquetées « hypothèses du vendeur », jamais comme
 *    des faits collectés.
 *
 * Ajout seulement, colonnes nullables : aucun élément existant ne change.
 */
export class TargetListItemsTierSellerHypotheses1796434712345 implements MigrationInterface {
  name = 'TargetListItemsTierSellerHypotheses1796434712345'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE target_list_items ADD COLUMN IF NOT EXISTS tier_label text`)
    await queryRunner.query(`ALTER TABLE target_list_items ADD COLUMN IF NOT EXISTS seller_hypotheses jsonb`)
    await queryRunner.query(
      `ALTER TABLE target_list_items DROP CONSTRAINT IF EXISTS target_list_items_tier_label_check`,
    )
    await queryRunner.query(`
      ALTER TABLE target_list_items ADD CONSTRAINT target_list_items_tier_label_check
        CHECK (tier_label IS NULL OR tier_label IN ('A', 'B', 'C'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE target_list_items DROP CONSTRAINT IF EXISTS target_list_items_tier_label_check`,
    )
    await queryRunner.query(`ALTER TABLE target_list_items DROP COLUMN IF EXISTS seller_hypotheses`)
    await queryRunner.query(`ALTER TABLE target_list_items DROP COLUMN IF EXISTS tier_label`)
  }
}
