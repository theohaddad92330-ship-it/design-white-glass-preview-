import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4158.14 / #4158.19 — la boîte de réception d'ÉQUIPE.
 *
 * `notifications` était par utilisateur seulement. Deux colonnes NULLABLES
 * l'ouvrent à l'espace sans rien réécrire : `workspace_id` (l'espace où le
 * geste a eu lieu — NULL = notification personnelle, comme avant) et
 * `actor_user_id` (l'auteur du geste, pour l'écrire en clair).
 *
 * Quatre interrupteurs e-mail sur `notification_preferences`, TOUS faux par
 * défaut : un e-mail à un collègue est un envoi, il se consent (#2082.16).
 */
export class TeamInboxNotifications1796498061438 implements MigrationInterface {
  public name = 'TeamInboxNotifications1796498061438'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id uuid`)
    await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_user_id uuid`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS notifications_user_workspace_created_idx ON notifications (user_id, workspace_id, created_at DESC)`,
    )
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_on_assignment boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_on_delegation boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_on_mention boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_on_manager_digest boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
