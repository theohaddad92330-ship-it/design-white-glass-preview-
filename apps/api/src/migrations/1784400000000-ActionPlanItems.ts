import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `action_plan_items` — the user-owned, trackable version of the generated
 * action plan. Rows are seeded from `action_plans.weeks` the first time an
 * account's plan is read (`ActionPlanItemsService.listForAccount`); thereafter
 * `done` / `due_date` persist per item so the web checklist survives a reload
 * and overdue items feed the daily "Rappels de relance" notification.
 *
 * `week_index` / `step_index` are the item's 0-based position inside the plan
 * (phase, action). `last_reminded_on` dedups the relance cron to one reminder
 * per item per calendar day. RLS scopes every row to its owner
 * (`auth.uid() = user_id`); the API also scopes by `user_id` in every query.
 * Migration owned here (NestJS = owner of métier tables).
 */
export class ActionPlanItems1784400000000 implements MigrationInterface {
  public name = 'ActionPlanItems1784400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS action_plan_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        source_plan_id UUID REFERENCES action_plans(id) ON DELETE SET NULL,
        label TEXT NOT NULL DEFAULT '',
        week_index INTEGER NOT NULL DEFAULT 0,
        step_index INTEGER NOT NULL DEFAULT 0,
        done BOOLEAN NOT NULL DEFAULT false,
        due_date DATE,
        completed_at TIMESTAMPTZ,
        last_reminded_on DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // Board query: all items for one account, in plan order.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS action_plan_items_user_account_idx
        ON action_plan_items (user_id, account_id)
    `)

    // Relance cron: cheap scan of open, dated items (the overdue candidates).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS action_plan_items_due_idx
        ON action_plan_items (due_date)
        WHERE done = false AND due_date IS NOT NULL
    `)

    await queryRunner.query(`ALTER TABLE action_plan_items ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own action plan items"
        ON action_plan_items
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
