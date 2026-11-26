import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo D settings-compte.N1 — la « plage de tranquillité » : deux heures locales
 * (HH:MM, lues dans le fuseau du profil) entre lesquelles ni SMS ni notification
 * du navigateur ne sonnent. La cloche garde tout.
 *
 * ADDITIVE et NULLABLE : une ligne existante n'a pas de plage, et « aucune plage »
 * est la réponse honnête — rien n'est réduit au silence sans geste de la personne.
 * La contrainte est posée AVEC les colonnes (GA-11/12 : la contrainte avant le
 * code qui écrit).
 */
export class NotificationQuietHours1796574800007 implements MigrationInterface {
  name = 'NotificationQuietHours1796574800007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        ADD COLUMN IF NOT EXISTS quiet_hours_start text,
        ADD COLUMN IF NOT EXISTS quiet_hours_end text
    `)
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        ADD CONSTRAINT notification_preferences_quiet_hours_format
        CHECK (
          (quiet_hours_start IS NULL OR quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
          AND (quiet_hours_end IS NULL OR quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_quiet_hours_format`,
    )
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        DROP COLUMN IF EXISTS quiet_hours_start,
        DROP COLUMN IF EXISTS quiet_hours_end
    `)
  }
}
