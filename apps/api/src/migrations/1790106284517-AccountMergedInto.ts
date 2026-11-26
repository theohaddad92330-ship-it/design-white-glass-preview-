import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le compte auquel un doublon a été RATTACHÉ (#1111).
 *
 * « J'ai lancé plus tôt ce matin deux analyses, sur KLESIA et KLESIA ADP. C'est
 * la même chose, simplement des entités. Ce serait bien de pouvoir "fusionner"
 * deux prospects / clients en un seul compte. »
 *
 * Une colonne, et pas une table de fusion : il n'y a qu'UNE réponse par compte
 * — « ce dossier a été rattaché à celui-là » — et une table imposerait de
 * choisir laquelle des lignes fait foi le jour où il y en aura deux.
 *
 * Ce que la colonne rend possible, et qui est la raison de son existence : dire
 * à l'écran « ce dossier a été rattaché à KLESIA » au lieu de laisser un compte
 * archivé sans explication, et refuser de rattacher deux fois — un doublon
 * rattaché n'est plus un doublon.
 *
 * Aucune contrainte de clé étrangère : le compte cible peut être supprimé
 * indépendamment, et une cascade emporterait alors l'historique du dossier
 * rattaché — exactement ce que ce chantier existe pour ne pas faire.
 *
 * Additive et idempotente. `NULL` = comportement d'avant, à l'octet près.
 */
export class AccountMergedInto1790106284517 implements MigrationInterface {
  public name = 'AccountMergedInto1790106284517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS merged_into_id uuid`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_merged_into ON accounts (merged_into_id) WHERE merged_into_id IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_accounts_merged_into`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS merged_into_id`)
  }
}
