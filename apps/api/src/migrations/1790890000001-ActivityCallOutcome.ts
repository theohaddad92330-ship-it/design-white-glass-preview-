import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'ISSUE d'un appel (N11-B).
 *
 * `activities` savait qu'un appel avait eu lieu ; rien ne disait s'il avait
 * abouti, s'il était tombé sur une messagerie, ou sur la mauvaise personne.
 * `call_outcome` reprend la taxonomie déjà portée par
 * `WORKFLOW_OUTCOME_CATALOG.cold_call_qualification.outcomes`
 * (`packages/contracts/src/schemas/workflow-outcomes.ts`) plutôt que d'en
 * ouvrir une seconde — voir `CALL_OUTCOMES` dans
 * `packages/contracts/src/schemas/activity.ts`, où un test vérifie que les
 * deux restent identiques.
 *
 * Colonne NULLABLE dès sa création : elle n'a de sens que pour `kind = 'call'`,
 * et une ligne — nouvelle comme ancienne — sans issue renseignée se lit
 * « non renseignée », jamais un échec par défaut (GA-11 / GA-12 : la
 * contrainte s'élargit avant le code qui écrit, mais ici la colonne n'a jamais
 * été plus étroite qu'elle ne l'est).
 */
export class ActivityCallOutcome1790890000001 implements MigrationInterface {
  public name = 'ActivityCallOutcome1790890000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS call_outcome text`)
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_call_outcome_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_call_outcome_check
        CHECK (call_outcome IS NULL OR call_outcome IN (
          'connected_qualified', 'connected_no_fit', 'callback_scheduled', 'voicemail', 'wrong_contact', 'no_answer'
        ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_call_outcome_check`)
    await queryRunner.query(`ALTER TABLE activities DROP COLUMN IF EXISTS call_outcome`)
  }
}
