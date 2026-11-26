import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2416.39 — « changement de contact » comme condition d'arrêt de la relance
 * CRA (épopée #2972).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE COLONNE, ET PAS UNE COMPARAISON EN LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le contact a changé » suppose de savoir DEPUIS QUAND on relance CE
 * contact-là. `missions.cra_contact_id` (migration `MissionCraContact`) ne
 * porte que la valeur ACTUELLE — rien ne mémorisait celle en vigueur au
 * moment où la séquence de relance a commencé. Cette colonne fige un
 * INSTANTANÉ : le contact CRA de la mission au moment de la PREMIÈRE relance
 * de la période en cours (`TimesheetsService.recordReminder`). Si le contact
 * CRA de la mission diverge ensuite de cet instantané, la séquence s'arrête
 * — décision Louis 27/09/2026 : « la séquence s'arrête (...) quand le contact
 * de la séquence change ».
 *
 * Nullable et additive : les relevés déjà en base n'ont jamais eu de relance,
 * ou en ont eu avant cette colonne — ils repartent à `NULL` (« pas encore
 * d'instantané »), jamais une valeur devinée.
 */
export class MissionTimesheetReminderContactSnapshot1796322871937 implements MigrationInterface {
  public name = 'MissionTimesheetReminderContactSnapshot1796322871937'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        ADD COLUMN IF NOT EXISTS reminder_contact_id uuid
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mission_timesheets DROP COLUMN IF EXISTS reminder_contact_id`)
  }
}
