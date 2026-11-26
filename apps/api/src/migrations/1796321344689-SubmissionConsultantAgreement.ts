import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2320.18 (épopée #2967) — « Shortlist → Positionnement nécessite accord
 * consultant et package ».
 *
 * Deux colonnes NULLABLES, additives — un positionnement déjà en base n'a
 * rien de déclaré, et `NULL` le dit, jamais un défaut inventé (GA-18/GA-19).
 * Même vocabulaire et même garde que `mission_assignments.consent_given` /
 * `consent_date` (#2407.4, migration `1795999539557`) : un booléen déclaré,
 * jamais deviné — un « non » se date aussi, c'est le refus qui compte, pas
 * son sens. Nommé différemment (`consultant_agreement`, pas `consent_given`)
 * parce que ce n'est PAS le même réglage (GA-26) : celui-ci porte sur
 * l'accord à être PROPOSÉ pour cette opportunité précise, avant l'envoi ;
 * celui de `mission_assignments` porte sur l'affectation à une mission
 * DÉJÀ décidée.
 */
export class SubmissionConsultantAgreement1796321344689 implements MigrationInterface {
  name = 'SubmissionConsultantAgreement1796321344689'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE submissions
        ADD COLUMN IF NOT EXISTS consultant_agreement boolean NULL,
        ADD COLUMN IF NOT EXISTS consultant_agreement_date date NULL
    `)
    await queryRunner.query(`
      ALTER TABLE submissions
        DROP CONSTRAINT IF EXISTS submission_consultant_agreement_date_check,
        ADD CONSTRAINT submission_consultant_agreement_date_check
          CHECK (consultant_agreement_date IS NULL OR consultant_agreement IS NOT NULL)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE submissions
        DROP CONSTRAINT IF EXISTS submission_consultant_agreement_date_check,
        DROP COLUMN IF EXISTS consultant_agreement_date,
        DROP COLUMN IF EXISTS consultant_agreement
    `)
  }
}
