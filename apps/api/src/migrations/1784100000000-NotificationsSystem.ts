import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Notification system tables:
 *
 *  - `notification_preferences` — one row per user holding the five toggles on
 *    the Notifications settings screen. Defaults mirror the shipped UI
 *    (buy signals + both changelog rows ON, reminders + weekly summary OFF).
 *  - `notifications` — the in-app notification centre feed (bell dropdown).
 *
 * RLS scopes every row to its owner (`auth.uid() = user_id`). Migration owned
 * here (NestJS = owner of métier tables).
 */
export class NotificationsSystem1784100000000 implements MigrationInterface {
  public name = 'NotificationsSystem1784100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
        buy_signals BOOLEAN NOT NULL DEFAULT true,
        relance_reminders BOOLEAN NOT NULL DEFAULT false,
        weekly_summary BOOLEAN NOT NULL DEFAULT false,
        sidebar_changelog BOOLEAN NOT NULL DEFAULT true,
        newsletter_changelog BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own notification preferences"
        ON notification_preferences
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        link TEXT,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // Feed query: newest-first per user. Partial index keeps the unread-count
    // lookup cheap.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS notifications_user_created_idx
        ON notifications (user_id, created_at DESC)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
        ON notifications (user_id)
        WHERE read_at IS NULL
    `)

    await queryRunner.query(`ALTER TABLE notifications ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can read their own notifications"
        ON notifications
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
