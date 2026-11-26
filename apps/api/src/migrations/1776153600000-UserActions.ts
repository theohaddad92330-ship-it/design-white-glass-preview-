import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `user_actions` tracks commercial actions: messages copied/sent, responses
 * received, meetings obtained, deals signed, analyses started/completed.
 */
export class UserActions1776153600000 implements MigrationInterface {
  public name = 'UserActions1776153600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
        contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
        action_type TEXT NOT NULL CHECK (action_type IN (
          'message_copied', 'message_sent', 'response_received',
          'rdv_obtained', 'deal_signed', 'analysis_started', 'analysis_completed',
          'plan_action_added', 'plan_action_completed', 'plan_action_uncompleted',
          'plan_action_skipped', 'plan_action_rescheduled', 'plan_action_opened',
          'plan_action_contact_opened', 'plan_action_message_generated',
          'plan_action_message_copied', 'plan_action_message_sent',
          'plan_action_call_prepared', 'plan_action_call_logged',
          'plan_action_linkedin_opened', 'plan_action_enrichment_requested'
        )),
        channel TEXT CHECK (channel IN ('linkedin', 'email', 'phone', 'meeting', 'other')),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    await queryRunner.query(`ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own actions"
        ON user_actions
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS user_actions_user_id_idx ON user_actions (user_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS user_actions_account_id_idx ON user_actions (account_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS user_actions_created_at_idx ON user_actions (created_at DESC)`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
