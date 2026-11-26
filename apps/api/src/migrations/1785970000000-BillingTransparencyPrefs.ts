import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Transparence billing (retours Théo beta 15/08 — « personne ne doit découvrir
 * un débit crédit a posteriori ») : deux toggles de plus sur
 * `notification_preferences`, tous deux défaut ON :
 *
 *  - `credit_low` — alerte in-app au débit quand le solde du workspace passe
 *    sous ~20 % du quota du plan (max 1 par cycle de quota, anti-spam côté
 *    `CreditsService`).
 *  - `action_overdue` — digest quotidien in-app des actions de plan dont
 *    l'échéance est dépassée (UNE notification récapitulative, sans email —
 *    distinct des « rappels de relance » opt-in qui notifient par item).
 *
 * Additif + idempotent (`ADD COLUMN IF NOT EXISTS`, NOT NULL DEFAULT true —
 * les lignes existantes sont backfillées par le défaut). RLS inchangé.
 */
export class BillingTransparencyPrefs1785970000000 implements MigrationInterface {
  public name = 'BillingTransparencyPrefs1785970000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS credit_low BOOLEAN NOT NULL DEFAULT true`,
    )
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS action_overdue BOOLEAN NOT NULL DEFAULT true`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
