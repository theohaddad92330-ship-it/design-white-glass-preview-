import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #5223 — un dépôt lit TOUTES les feuilles du classeur : `sheet_passes` porte une passe par feuille (sa
 * correspondance de colonnes, son point de reprise, son bilan). Ajout seul, nullable : un job existant, un CSV ou
 * un import d'une seule feuille garde `NULL` et suit son chemin d'avant. `universal_import_issues.sheet` nomme la
 * feuille d'un écart — deux feuilles ont chacune leur ligne 2.
 */
export class UniversalImportSheetPasses1796900202780 implements MigrationInterface {
  public name = 'UniversalImportSheetPasses1796900202780'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS sheet_passes jsonb`)
    await queryRunner.query(`ALTER TABLE universal_import_issues ADD COLUMN IF NOT EXISTS sheet text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE universal_import_issues DROP COLUMN IF EXISTS sheet`)
    await queryRunner.query(`ALTER TABLE universal_import_jobs DROP COLUMN IF EXISTS sheet_passes`)
  }
}
