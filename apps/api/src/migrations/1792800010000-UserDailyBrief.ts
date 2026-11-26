import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE MARQUEUR « PREMIÈRE OUVERTURE DU JOUR » DE LAURA (#1936, lot 7A).
 *
 * Décision de Louis du 12/09/2026 : la 1re ouverture de Laura dans la journée
 * EST le brief du matin. `user_daily_brief` porte un seul repère par
 * utilisateur — `last_shown_on`, la date-clé (`YYYY-MM-DD`) du dernier jour
 * où le marqueur a déjà été consommé, dans le fuseau REÇU au moment de
 * l'appel (jamais stocké : voir `time-zone-input.ts`).
 *
 * PK sur `user_id` seul, comme `user_last_seen` (`1788051327419`) : un
 * marqueur d'OUVERTURE D'APPLICATION, pas une donnée d'espace.
 *
 * Additif + idempotent (`CREATE TABLE IF NOT EXISTS`). RLS inchangée.
 * Migration détenue par NestJS (owner des tables métier).
 */
export class UserDailyBrief1792800010000 implements MigrationInterface {
  public name = 'UserDailyBrief1792800010000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_daily_brief (
        user_id uuid PRIMARY KEY,
        last_shown_on text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
