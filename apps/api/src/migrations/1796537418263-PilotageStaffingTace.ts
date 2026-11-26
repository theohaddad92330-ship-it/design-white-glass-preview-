import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L3 Pilotage › Staffing (14/10/2026) — deux ajouts, ADDITIFS seulement.
 *
 *  1. `consultant_absences` : les congés et absences d'un consultant. Sans elle, la
 *     capacité d'une semaine de congés comptait comme disponible, et le TACE
 *     reprochait à quelqu'un de n'avoir pas travaillé pendant ses vacances.
 *     `kind` est borné par un CHECK ; élargi AVANT le code qui écrit (GA-11/GA-12).
 *  2. `workspaces.tace_alert_threshold_percent` : le seuil d'alerte TACE de
 *     l'espace. NULL = rien saisi = aucune alerte, jamais 0. Même doctrine que
 *     `margin_alert_threshold_percent` : un seuil qui se déclenche seul le premier
 *     jour apprend surtout à ignorer les alertes.
 *
 * RLS : un filet, pas la serrure — l'autorisation réelle vit dans le contrôleur
 * (`team:manage`, workspace de l'appelant).
 */
export class PilotageStaffingTace1796537418263 implements MigrationInterface {
  name = 'PilotageStaffingTace1796537418263'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultant_absences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        consultant_id uuid NOT NULL REFERENCES consultants (id) ON DELETE CASCADE,
        kind text NOT NULL DEFAULT 'leave',
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT consultant_absences_kind_check CHECK (kind IN ('leave', 'sick', 'training', 'other')),
        CONSTRAINT consultant_absences_range_check CHECK (ends_on >= starts_on)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS consultant_absences_workspace_idx ON consultant_absences (workspace_id, starts_on, ends_on)`,
    )
    await queryRunner.query(`ALTER TABLE consultant_absences ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "consultant_absences_member_read" ON consultant_absences`)
    await queryRunner.query(`
      CREATE POLICY "consultant_absences_member_read" ON consultant_absences FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)

    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tace_alert_threshold_percent numeric`)
    await queryRunner.query(`
      ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_tace_alert_threshold_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspaces ADD CONSTRAINT workspaces_tace_alert_threshold_check
        CHECK (tace_alert_threshold_percent IS NULL OR (tace_alert_threshold_percent >= 1 AND tace_alert_threshold_percent <= 100))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_tace_alert_threshold_check`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS tace_alert_threshold_percent`)
    await queryRunner.query(`DROP TABLE IF EXISTS consultant_absences`)
  }
}
