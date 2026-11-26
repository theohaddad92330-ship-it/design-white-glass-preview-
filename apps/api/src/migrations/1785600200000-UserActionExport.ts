import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Audit gap (P0 roadmap): a server-side export (Salesforce / HubSpot contact
 * push) was never journaled. Add an `export` value to the `user_actions`
 * action_type CHECK constraint so `ActionsService`/CRM services can record it
 * (it maps to the existing `export` history category).
 *
 * Additive + idempotent (drop-then-add): re-declares the full allowed set as of
 * the previous constraint migration (`ActionExecution1784900800000`, which
 * appended `plan_action_assigned`) with `export` added. RLS on the table is
 * unchanged. Migration owned by NestJS (owner of métier tables).
 */
export class UserActionExport1785600200000 implements MigrationInterface {
  public name = 'UserActionExport1785600200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const list = USER_ACTION_TYPES.map(type => `'${type}'`).join(',')
    await queryRunner.query(`ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check`)
    await queryRunner.query(
      `ALTER TABLE user_actions ADD CONSTRAINT user_actions_action_type_check CHECK (action_type IN (${list}))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

/** Full allowed `user_actions.action_type` set = previous set + `export`. Keep in
 *  sync with `actionTypeSchema` in `@bellum/contracts`. */
const USER_ACTION_TYPES = [
  'message_copied',
  'message_sent',
  'response_received',
  'rdv_obtained',
  'deal_signed',
  'analysis_started',
  'analysis_completed',
  'export',
  'plan_action_added',
  'plan_action_completed',
  'plan_action_uncompleted',
  'plan_action_skipped',
  'plan_action_rescheduled',
  'plan_action_opened',
  'plan_action_contact_opened',
  'plan_action_message_generated',
  'plan_action_message_copied',
  'plan_action_message_sent',
  'plan_action_call_prepared',
  'plan_action_call_logged',
  'plan_action_linkedin_opened',
  'plan_action_enrichment_requested',
  'plan_action_assigned',
]
