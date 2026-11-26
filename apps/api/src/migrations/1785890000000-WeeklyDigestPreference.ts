import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Pref `weekly_digest` (D3 — email digest hebdo de veille) : un toggle de plus
 * sur `notification_preferences`, défaut ON (politique zéro-flag produit — le
 * digest ne part que s'il y a des signaux réels de la semaine, jamais creux).
 * L'opt-out reste double : ce toggle OU la suppression list #394, tous deux
 * vérifiés avant chaque envoi.
 *
 * Additif + idempotent (`ADD COLUMN IF NOT EXISTS`, NOT NULL DEFAULT true —
 * les lignes existantes sont backfillées par le défaut). RLS inchangé.
 */
export class WeeklyDigestPreference1785890000000 implements MigrationInterface {
  public name = 'WeeklyDigestPreference1785890000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS weekly_digest BOOLEAN NOT NULL DEFAULT true`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
