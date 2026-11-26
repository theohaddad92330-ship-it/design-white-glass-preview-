import { MigrationInterface, QueryRunner } from 'typeorm'

const ACTION_TYPES = [
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

const LEGACY_ACTION_TYPES = [
  'message_copied',
  'message_sent',
  'response_received',
  'rdv_obtained',
  'deal_signed',
  'analysis_started',
  'analysis_completed',
]

export class UserActionsPlanActions1783000000001 implements MigrationInterface {
  public name = 'UserActionsPlanActions1783000000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await replaceUserActionsTypeConstraint(queryRunner, ACTION_TYPES)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await replaceUserActionsTypeConstraint(queryRunner, LEGACY_ACTION_TYPES)
  }
}

async function replaceUserActionsTypeConstraint(queryRunner: QueryRunner, actionTypes: string[]) {
  const list = actionTypes.map(type => `'${type}'`).join(',')
  await queryRunner.query(`ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check`)
  await queryRunner.query(
    `ALTER TABLE user_actions ADD CONSTRAINT user_actions_action_type_check CHECK (action_type IN (${list}))`,
  )
}
