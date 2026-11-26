import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo B c4-assistant-import.N1 — la VÉRIFICATION avant import laisse l'humain décider ligne à ligne
 * (« Ne pas importer »). Le lancement garde ces numéros de ligne sur le job : le worker les saute, et une REPRISE
 * après interruption respecte la même décision.
 *
 * Colonne AJOUTÉE seulement (jamais une table réécrite), défaut `[]` : un job d'avant la vérification se relit à
 * l'identique, rien à rattraper. Le code qui l'écrit arrive APRÈS cette migration (GA-11/GA-12).
 */
export class UniversalImportSkippedLines1796575083251 implements MigrationInterface {
  name = 'UniversalImportSkippedLines1796575083251'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS skipped_lines jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE universal_import_jobs DROP COLUMN IF EXISTS skipped_lines`)
  }
}
