import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4426.4 — l'onglet d'un classeur XLSX lu par un import universel. Ajout seul, nullable : un job existant
 * (ou un CSV / JSON) garde `NULL`, c'est-à-dire le choix automatique de l'onglet.
 */
export class UniversalImportSheet1796570075627 implements MigrationInterface {
  public name = 'UniversalImportSheet1796570075627'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS sheet text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE universal_import_jobs DROP COLUMN IF EXISTS sheet`)
  }
}
