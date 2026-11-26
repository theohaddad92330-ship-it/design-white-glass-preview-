import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3918.2 (lot M01, 09/10/2026) — GA-11/12 : le CHECK s'élargit AVANT le code
 * qui écrit une valeur neuve.
 *
 * Treizième émetteur migré : `RoutineExecutors.contactJobChange` (routine
 * `contact_job_change`) construit un `TriggerEvent` `contact_changement_poste`
 * pour chaque contact que `CrmRoutinesService.contactsWhoMayHaveMoved` repère —
 * un fait observé (l'employeur déclaré ne correspond plus), jamais une
 * probabilité.
 */
export class CanonicalTriggerEventsWidenKindsContactJobChange1796437900102 implements MigrationInterface {
  public name = 'CanonicalTriggerEventsWidenKindsContactJobChange1796437900102'

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
        'reponse_positive',
        'signal_nouveau',
        'besoin_entrant',
        'deadline_ao',
        'changement_decideur',
        'referencement_detecte',
        'affaire_perdue',
        'affaire_dormante',
        'affaire_renouvellement',
        'contact_changement_poste'
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
        'margin_alert',
        'reponse_positive',
        'signal_nouveau',
        'besoin_entrant',
        'deadline_ao',
        'changement_decideur',
        'referencement_detecte',
        'affaire_perdue',
        'affaire_dormante',
        'affaire_renouvellement'
      ))
    `)
  }
}
