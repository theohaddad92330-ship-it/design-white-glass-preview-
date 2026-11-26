import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2005.4 (DÉCISION Louis 17/09/2026, lot CP2) — où l'ESN est IMPLANTÉE
 * (siège + bureaux), posée UNE FOIS par espace.
 *
 * Colonne ADDITIVE, `text[]` par défaut vide comme ses voisines
 * (`case_study_results`, `contractual_constraints`) : le questionnaire ne
 * bloque jamais, une question passée reste `[]`, jamais devinée. Aucun CHECK :
 * même règle que les colonnes voisines de ce type.
 */
export class CompanyLocations1795610000000 implements MigrationInterface {
  name = 'CompanyLocations1795610000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS company_locations text[] DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS company_locations;
    `)
  }
}
