import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Give `action_plan_items` an executable lifecycle (Théo P1/P2 — "les actions
 * doivent être exécutables : fait, snooze, assigner"). The board's actions were
 * display-only apart from the `done` checkbox; this adds the state a commercial
 * needs to actually work a plan:
 *
 *  - `execution_status` (`todo` | `done` | `snoozed`) — the executable state.
 *    Backfilled from the existing `done` boolean and kept in sync with it
 *    server-side, so the legacy checkbox flow is untouched.
 *  - `snoozed_until` — ISO timestamp a snoozed action is parked until.
 *  - `assigned_to` — the workspace member the action is delegated to.
 *
 * Every statement is guarded (`IF NOT EXISTS` / drop-then-add) so the migration
 * is idempotent. RLS already scopes the table to its owner (`auth.uid()`),
 * unchanged here. Migration owned by NestJS (owner of métier tables).
 */
export class ActionExecution1784900800000 implements MigrationInterface {
  public name = 'ActionExecution1784900800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS execution_status TEXT NOT NULL DEFAULT 'todo'`,
    )
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS assigned_to UUID`)

    // Constrain the lifecycle to the known states (drop-then-add = idempotent).
    await queryRunner.query(
      `ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_execution_status_check`,
    )
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_execution_status_check
         CHECK (execution_status IN ('todo', 'done', 'snoozed'))`,
    )

    // Backfill: rows already completed via the boolean become `done`.
    await queryRunner.query(
      `UPDATE action_plan_items SET execution_status = 'done' WHERE done = true AND execution_status = 'todo'`,
    )

    // "Assigned to me" / "snoozed re-surface" scans stay cheap.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS action_plan_items_assigned_to_idx
         ON action_plan_items (assigned_to) WHERE assigned_to IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS action_plan_items_snoozed_until_idx
         ON action_plan_items (snoozed_until) WHERE execution_status = 'snoozed'`,
    )

    // Record the "assigner" action in the team activity feed like the other
    // plan-action events. Extend the user_actions type constraint additively.
    await extendUserActionTypes(queryRunner, [...USER_ACTION_TYPES, 'plan_action_assigned'])
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

/**
 * The full allowed `user_actions.action_type` set as of the previous migration
 * (`UserActionsPlanActions1783000000001`), so we re-declare the CHECK with the
 * new `plan_action_assigned` value appended rather than dropping the guard.
 */
const USER_ACTION_TYPES = [
  'message_copied',
  'message_sent',
  'response_received',
  'rdv_obtained',
  'deal_signed',
  'analysis_started',
  'analysis_completed',
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
]

async function extendUserActionTypes(queryRunner: QueryRunner, actionTypes: string[]) {
  const list = actionTypes.map(type => `'${type}'`).join(',')
  await queryRunner.query(`ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check`)
  await queryRunner.query(
    `ALTER TABLE user_actions ADD CONSTRAINT user_actions_action_type_check CHECK (action_type IN (${list}))`,
  )
}
