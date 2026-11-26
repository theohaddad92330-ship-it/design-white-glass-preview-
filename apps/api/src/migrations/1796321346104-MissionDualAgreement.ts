import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2320.21 (épopée #2967) — « Retenu → Mission nécessite accord client ET
 * accord consultant ».
 *
 * Quatre colonnes NULLABLES, additives — une mission déjà en base n'a rien de
 * déclaré, et `NULL` le dit, jamais un défaut inventé (GA-18/GA-19). Les DEUX
 * rails sont des colonnes DISTINCTES, jamais un seul booléen fusionné : « la
 * mission a été créée » ne dit pas LEQUEL des deux accords a été obtenu, et
 * c'est justement le défaut que #2320.21 nomme. Même garde que
 * `consultant_agreement`/`consultant_agreement_date` des positionnements
 * (#2320.18, migration `1796321344689`) et `consent_given`/`consent_date` des
 * affectations (#2407.4) : un booléen déclaré jamais deviné, une date qui n'a
 * de sens QUE si le booléen est renseigné.
 */
export class MissionDualAgreement1796321346104 implements MigrationInterface {
  name = 'MissionDualAgreement1796321346104'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS client_agreement boolean NULL,
        ADD COLUMN IF NOT EXISTS client_agreement_date date NULL,
        ADD COLUMN IF NOT EXISTS consultant_agreement boolean NULL,
        ADD COLUMN IF NOT EXISTS consultant_agreement_date date NULL
    `)
    await queryRunner.query(`
      ALTER TABLE missions
        DROP CONSTRAINT IF EXISTS mission_client_agreement_date_check,
        ADD CONSTRAINT mission_client_agreement_date_check
          CHECK (client_agreement_date IS NULL OR client_agreement IS NOT NULL),
        DROP CONSTRAINT IF EXISTS mission_consultant_agreement_date_check,
        ADD CONSTRAINT mission_consultant_agreement_date_check
          CHECK (consultant_agreement_date IS NULL OR consultant_agreement IS NOT NULL)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        DROP CONSTRAINT IF EXISTS mission_consultant_agreement_date_check,
        DROP CONSTRAINT IF EXISTS mission_client_agreement_date_check,
        DROP COLUMN IF EXISTS consultant_agreement_date,
        DROP COLUMN IF EXISTS consultant_agreement,
        DROP COLUMN IF EXISTS client_agreement_date,
        DROP COLUMN IF EXISTS client_agreement
    `)
  }
}
