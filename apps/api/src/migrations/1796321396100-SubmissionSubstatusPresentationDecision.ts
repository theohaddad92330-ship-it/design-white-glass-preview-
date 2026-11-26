import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2189.20/.21/.33/.34/.36 (épopée #2940) — élargit `submissions_substatus_check`
 * à CINQ sous-statuts ADDITIFS : deux issues d'une présentation en plus de
 * « présenté » (échec technique, copie manuelle sans connecteur), et trois
 * décisions post-entretien en plus de « second entretien » (poursuivre,
 * clarifier, négocier).
 *
 * La contrainte CHECK est posée AVANT le code qui écrit la valeur (GA-11/GA-12) —
 * même discipline que `1795999454405-SubmissionSubstatus.ts`, qu'elle élargit.
 */
export class SubmissionSubstatusPresentationDecision1796321396100 implements MigrationInterface {
  name = 'SubmissionSubstatusPresentationDecision1796321396100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_substatus_check`)
    // Les seize existantes DANS LEUR ORDRE, les cinq nouvelles en fin — même
    // discipline que GA-08 côté TypeScript.
    await queryRunner.query(`
      ALTER TABLE submissions
        ADD CONSTRAINT submissions_substatus_check
        CHECK (substatus IS NULL OR substatus IN (
          'to_qualify', 'consultant_agreement_pending', 'ready_to_present', 'to_validate',
          'presented', 'acknowledged', 'interview_to_schedule', 'interview_scheduled',
          'interview_done', 'second_interview', 'selected', 'declined', 'withdrawn',
          'no_response', 'converted_to_mission', 'archived',
          'presentation_failed', 'presented_manually', 'to_pursue', 'to_clarify', 'to_negotiate'
        ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On PURGE les lignes des cinq natures nouvelles avant de resserrer : une
    // contrainte qu'on remet sans nettoyer échoue sur les données existantes.
    await queryRunner.query(`
      UPDATE submissions SET substatus = NULL
       WHERE substatus IN ('presentation_failed', 'presented_manually', 'to_pursue', 'to_clarify', 'to_negotiate')
    `)
    await queryRunner.query(`ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_substatus_check`)
    await queryRunner.query(`
      ALTER TABLE submissions
        ADD CONSTRAINT submissions_substatus_check
        CHECK (substatus IS NULL OR substatus IN (
          'to_qualify', 'consultant_agreement_pending', 'ready_to_present', 'to_validate',
          'presented', 'acknowledged', 'interview_to_schedule', 'interview_scheduled',
          'interview_done', 'second_interview', 'selected', 'declined', 'withdrawn',
          'no_response', 'converted_to_mission', 'archived'
        ))
    `)
  }
}
