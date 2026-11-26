import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2875 (#2402.3, épopée « moteur de déclencheurs commerciaux canonique »,
 * lot V11 28/09/2026) — GA-11/12 : le CHECK s'élargit AVANT le code qui
 * écrit une valeur neuve, jamais après.
 *
 * Sixième émetteur migré au registre canonique : `MailboxService.reconcileReplySequences`
 * construit désormais AUSSI un `TriggerEvent` (`reponse_positive`) quand une
 * réponse entrante classe `positive` (#2381.4/.6, la même classification qui
 * arrête déjà la séquence et crée l'action de qualification — jamais un
 * second calcul). Trois des quatre signaux commerciaux nommés `planned` par
 * l'épopée (`changement_decideur`/`deadline_ao`/`referencement_detecte`)
 * restent SANS détecteur réel nulle part dans le dépôt — vérifié par
 * `git grep`, pas deviné — donc pas migrés ici : les inventer violerait
 * « jamais de donnée fictive ».
 */
export class CanonicalTriggerEventsWidenKindsReponsePositive1796342400000 implements MigrationInterface {
  public name = 'CanonicalTriggerEventsWidenKindsReponsePositive1796342400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE canonical_trigger_events
      DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE canonical_trigger_events
      ADD CONSTRAINT canonical_trigger_events_kind_check CHECK (kind IN (
        'duplicate_pair_detected',
        'submission_stalled',
        'renewal_at_risk',
        'invoicing_blocked',
        'account_untouched',
        'rep_inactive',
        'credits_exhausted',
        'account_no_next_action',
        'project_no_decision',
        'need_without_shortlist',
        'timesheet_missing',
        'payment_overdue',
        'mission_without_end_date',
        'staffing_collision',
        'credit_low',
        'ao_publie',
        'timesheet_chase',
        'invoice_readiness_routine',
        'margin_alert',
        'reponse_positive'
      ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE canonical_trigger_events
      DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE canonical_trigger_events
      ADD CONSTRAINT canonical_trigger_events_kind_check CHECK (kind IN (
        'duplicate_pair_detected',
        'submission_stalled',
        'renewal_at_risk',
        'invoicing_blocked',
        'account_untouched',
        'rep_inactive',
        'credits_exhausted',
        'account_no_next_action',
        'project_no_decision',
        'need_without_shortlist',
        'timesheet_missing',
        'payment_overdue',
        'mission_without_end_date',
        'staffing_collision',
        'credit_low',
        'ao_publie',
        'timesheet_chase',
        'invoice_readiness_routine',
        'margin_alert'
      ))
    `)
  }
}
