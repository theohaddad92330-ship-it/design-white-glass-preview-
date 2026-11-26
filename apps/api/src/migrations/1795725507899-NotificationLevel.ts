import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2404.3 — LES QUATRE NIVEAUX NOMMÉS, JAMAIS POUR L'ENGAGEMENT.
 *
 * `notifications` ne portait qu'un `priority` 0-100 et un `type` — aucun
 * niveau NOMMÉ (Information / Action / Urgent / Critique). GA-11/GA-12 :
 * cette migration pose la colonne et sa contrainte AVANT le code qui l'écrit
 * (`NotificationsService.createNotification`, `notificationLevelFor` dans
 * `@bellum/contracts`).
 *
 * `level` reste NULLABLE, sans défaut : une ligne existante n'a pas de niveau
 * calculé rétroactivement (GA-18/GA-19 — « pas mesuré » n'est jamais la valeur
 * la plus basse), et le code n'écrit ce champ qu'à la CRÉATION.
 */
export class NotificationLevel1795725507899 implements MigrationInterface {
  public name = 'NotificationLevel1795725507899'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS level text`)
    await queryRunner.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_level`)
    await queryRunner.query(`
      ALTER TABLE notifications
        ADD CONSTRAINT chk_notifications_level
        CHECK (level IS NULL OR level IN ('information', 'action', 'urgent', 'critical'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_level`)
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS level`)
  }
}
