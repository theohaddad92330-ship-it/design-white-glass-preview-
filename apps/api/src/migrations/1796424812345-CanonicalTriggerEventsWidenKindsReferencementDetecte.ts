import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2875 (#2402.3, lot X54 02/10/2026) — GA-11/12 : le CHECK s'élargit AVANT le
 * code qui écrit une valeur neuve.
 *
 * Onzième émetteur migré : `DiscoverAlertEventSweeper.sweepReferencementDetecte`
 * construit un `TriggerEvent` `referencement_detecte` à partir d'un fait d'accès
 * PAR ESPACE (`access_facts`, kind `mode`, valeur `direct_reference`) — pas de la
 * table partagée du marché, qui n'a pas d'espace.
 */
export class CanonicalTriggerEventsWidenKindsReferencementDetecte1796424812345 implements MigrationInterface {
  public name = 'CanonicalTriggerEventsWidenKindsReferencementDetecte1796424812345'

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
        'referencement_detecte'
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
        'changement_decideur'
      ))
    `)
  }
}
