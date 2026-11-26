import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Cadence de veille — préférence « digest quotidien » (restitution V2 §11,
 * « choix du canal/cadence »). Colonne opt-in sur `notification_preferences`.
 *
 * Défaut `false` : opt-in STRICT, rien ne part sans que la case ait été cochée.
 * Additive + idempotente.
 *
 * Historique utile au relecteur : à la pose de cette colonne, aucun cron ne
 * lisait le drapeau et l'écran affichait un badge « Bientôt ». L'envoi réel
 * existe depuis (`DailyDigestService.run` sous le cron `daily-veille-digest`,
 * 06:30 Europe/Paris) et le badge a été retiré.
 */
export class NotificationWatchlistDailyDigest1788015818642 implements MigrationInterface {
  public name = 'NotificationWatchlistDailyDigest1788015818642'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        ADD COLUMN IF NOT EXISTS watchlist_daily_digest boolean NOT NULL DEFAULT false
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
