import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2875 (#2402.3, lot « reste » 29/09/2026) — GA-11/12 : le CHECK s'élargit
 * AVANT le code qui écrit une valeur neuve.
 *
 * Neuvième émetteur migré : `DiscoverAlertEventSweeper.sweepDeadlineAo`
 * construit un `TriggerEvent` `deadline_ao` pour un besoin né d'un appel
 * d'offres (`project_needs.source = 'tender'`, `deadline_at`) dont la remise
 * tombe sous 7 jours. `changement_decideur` et `referencement_detecte` restent
 * SANS détecteur exploitable (voir le commentaire de l'issue).
 */
export class CanonicalTriggerEventsWidenKindsDeadlineAo1796374300123 implements MigrationInterface {
  public name = 'CanonicalTriggerEventsWidenKindsDeadlineAo1796374300123'

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
        'deadline_ao'
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
        'besoin_entrant'
      ))
    `)
  }
}
