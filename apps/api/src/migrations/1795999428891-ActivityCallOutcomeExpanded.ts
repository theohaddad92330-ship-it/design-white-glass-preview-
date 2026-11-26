import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2377.3 — LES 18 OUTCOMES CANONIQUES D'UN APPEL.
 *
 * `activities_call_outcome_check` (migration `1790890000001`) ne couvrait
 * que 6 valeurs. Le corps de l'issue #2377 (§OUTCOMES CANONIQUES) en liste
 * 18 ; `CALL_OUTCOMES` (`packages/contracts/src/schemas/activity.ts`) et
 * `WORKFLOW_OUTCOME_CATALOG.cold_call_qualification.outcomes`
 * (`workflow-outcomes.ts`) ont été élargis en conséquence — GA-08 : les 6
 * valeurs d'origine restent, dans le même ordre, les 14 nouvelles vont en
 * fin.
 *
 * GA-11/GA-12 : la contrainte SQL s'élargit ici, AVANT qu'un code n'écrive
 * une des 14 valeurs neuves. Additive seulement — aucune des 6 valeurs
 * historiques ne disparaît, une ligne déjà écrite reste valide.
 */
export class ActivityCallOutcomeExpanded1795999428891 implements MigrationInterface {
  public name = 'ActivityCallOutcomeExpanded1795999428891'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_call_outcome_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_call_outcome_check
        CHECK (call_outcome IS NULL OR call_outcome IN (
          'connected_qualified', 'connected_no_fit', 'callback_scheduled', 'voicemail', 'wrong_contact', 'no_answer',
          'orientation_given', 'not_now', 'interest', 'need_detected', 'need_confirmed', 'meeting_booked', 'refused',
          'opt_out', 'email_requested', 'document_requested', 'partner_opportunity', 'invalid_contact', 'left_company', 'other'
        ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_call_outcome_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_call_outcome_check
        CHECK (call_outcome IS NULL OR call_outcome IN (
          'connected_qualified', 'connected_no_fit', 'callback_scheduled', 'voicemail', 'wrong_contact', 'no_answer'
        ))
    `)
  }
}
