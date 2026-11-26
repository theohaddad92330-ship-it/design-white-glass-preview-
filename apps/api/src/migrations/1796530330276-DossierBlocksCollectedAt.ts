import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4078 (14/10/2026) — LA DATE DE COLLECTE DU SEPTIÈME SEGMENT : LES CINQ BLOCS
 * DU DOSSIER COMPLET (axes de lecture, écosystème tiers, domaines d'opportunité,
 * indicateurs financiers, garde-fous de fiabilité).
 *
 * `DossierBlocksStep` les produit après une vraie analyse depuis l'intégration
 * `f2258af8ac` (13/10). Un compte analysé avant ne les porte pas, et rien ne le
 * disait à l'écran. Doctrine « un correctif de collecte RATTRAPE l'existant » :
 * « concerné » se décide sur la date de collecte du SEGMENT contre la date de la
 * capacité (`SEGMENT_CAPABILITY_EPOCH.dossier_blocks`), jamais sur un symptôme.
 *
 * Additive, même forme EXACTE que `dossier_read_collected_at` : `timestamptz`,
 * NULLABLE, `IF NOT EXISTS`. `NULL` = jamais datée — CONCERNÉE par le rattrapage.
 * Seul écrivain : `DossierBlocksStep.produceDossierBlocks`.
 */
export class DossierBlocksCollectedAt1796530330276 implements MigrationInterface {
  public name = 'DossierBlocksCollectedAt1796530330276'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dossier_blocks_collected_at timestamptz NULL`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
