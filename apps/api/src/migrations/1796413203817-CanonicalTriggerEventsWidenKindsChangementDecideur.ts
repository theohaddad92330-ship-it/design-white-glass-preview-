import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2875 (#2402.3, lot P06 30/09/2026) — GA-11/12 : le CHECK s'élargit AVANT le
 * code qui écrit une valeur neuve.
 *
 * Dixième émetteur migré : `DiscoverAlertEventSweeper.sweepChangementDecideur`
 * construit un `TriggerEvent` `changement_decideur` quand la MÉMOIRE de
 * transition (`contact_decision_role_history`, migration suivante) consigne
 * qu'un contact est passé d'un rôle décisionnel à un autre.
 */
export class CanonicalTriggerEventsWidenKindsChangementDecideur1796413203817 implements MigrationInterface {
  public name = 'CanonicalTriggerEventsWidenKindsChangementDecideur1796413203817'

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
        'changement_decideur'
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
        'deadline_ao'
      ))
    `)
  }
}
