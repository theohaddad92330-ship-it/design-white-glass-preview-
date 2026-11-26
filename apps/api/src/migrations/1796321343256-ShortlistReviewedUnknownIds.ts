import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2320.17 (épopée #2967) — « Match → Shortlist nécessite revue critères et
 * inconnues » : sans copie des profils NON ÉVALUABLES du run au moment de la
 * création, rien ne prouve que la personne qui a composé la shortlist les a
 * vus avant de choisir.
 *
 * `NOT NULL DEFAULT '{}'` : le service dérive TOUJOURS cette colonne de
 * `run.notEvaluable` à l'écriture (jamais laissée à `NULL`) — un tableau vide
 * est un fait mesuré (« aucune inconnue à cette date »), jamais une absence.
 * Les shortlists déjà en base reçoivent `'{}'` par le défaut : honnête, leur
 * run d'origine n'est pas rejouable pour reconstituer la vraie liste.
 */
export class ShortlistReviewedUnknownIds1796321343256 implements MigrationInterface {
  name = 'ShortlistReviewedUnknownIds1796321343256'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shortlists ADD COLUMN IF NOT EXISTS reviewed_unknown_ids uuid[] NOT NULL DEFAULT '{}'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE shortlists DROP COLUMN IF EXISTS reviewed_unknown_ids`)
  }
}
