import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2875 (#2402.1, épopée « moteur de déclencheurs commerciaux canonique »,
 * vague F/G 27/09/2026) — GA-11/12 : le CHECK s'élargit AVANT le code qui
 * écrit une valeur neuve, jamais après.
 *
 * La migration `1796321589734-CanonicalTriggerEvents.ts` posait le registre
 * avec un CHECK délibérément étroit (`duplicate_pair_detected` seul) et notait
 * elle-même que les quatre autres émetteurs cités par #2402.1
 * (`intervention-rules.ts`, `discover_signals.py`, `credits.service.ts`,
 * `DeliveryRoutinesService`) ne migraient pas dans ce lot. Cette migration
 * élargit le CHECK aux dix-huit `type` que ces quatre émetteurs écrivent
 * désormais (treize natures d'intervention + `credit_low` + `ao_publie` +
 * les trois routines Delivery) — même liste que
 * `canonicalTriggerKindValues` (`packages/contracts/src/schemas/canonical-trigger.ts`).
 */
export class CanonicalTriggerEventsWidenKinds1796322780200 implements MigrationInterface {
  public name = 'CanonicalTriggerEventsWidenKinds1796322780200'

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
        'margin_alert'
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
      ADD CONSTRAINT canonical_trigger_events_kind_check CHECK (kind IN ('duplicate_pair_detected'))
    `)
  }
}
