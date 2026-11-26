import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ce qu'il manquait à un relevé d'activité pour être exploitable (PDF 5 §7).
 *
 * La table portait quatre colonnes : la mission, le mois, les jours, le statut.
 * Il manque tout ce dont la vue du 5 du mois a besoin :
 *
 *  - `consultant_id` : deux consultants sur une même mission déposent DEUX
 *    relevés. L'index d'unicité portait sur (mission, mois) — le second écrasait
 *    donc le premier, en silence.
 *  - `expected_days` : la charge attendue était recalculée à chaque lecture,
 *    donc elle changeait le jour où les jours fériés de l'espace changeaient.
 *    Un écart doit être celui qu'on a constaté, pas celui qu'on recalcule.
 *  - `gap_explanation` : sans elle, un écart connu et normal (congés, mission
 *    partielle) bloque la facturation pour toujours.
 *  - `validated_by_client_at` / `validated_by` : « validé » ne disait pas par
 *    qui. Le §7 distingue la validation interne de celle du client, et c'est la
 *    seconde qui autorise à facturer.
 *  - `reminders_sent` / `last_reminder_at` : la cadence [5, 12, 20] existait
 *    dans le code et n'avait aucune colonne où compter.
 *
 * Et la contrainte de statut, qui n'existait pas : sept valeurs attendues, zéro
 * garde-fou. La leçon `account_vocabulary.kind` s'applique — la contrainte est
 * posée AVANT le code qui écrit les trois nouvelles valeurs.
 */
export class TimesheetDepth1789691847302 implements MigrationInterface {
  public name = 'TimesheetDepth1789691847302'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        ADD COLUMN IF NOT EXISTS consultant_id uuid,
        ADD COLUMN IF NOT EXISTS expected_days numeric,
        ADD COLUMN IF NOT EXISTS gap_explanation text,
        ADD COLUMN IF NOT EXISTS validated_by_client_at timestamptz,
        ADD COLUMN IF NOT EXISTS validated_by uuid,
        ADD COLUMN IF NOT EXISTS reminders_sent integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
    `)

    // L'unicité passe de (mission, mois) à (mission, consultant, mois). Sans le
    // consultant, le deuxième relevé du mois écrasait le premier — la mission à
    // deux personnes est le cas ordinaire d'une ESN, pas un cas limite.
    // `COALESCE` sur un UUID nul : les relevés existants n'ont pas de
    // consultant, et un NULL en index d'unicité laisserait passer des doublons.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mission_timesheets_mission_id_period_month"`)
    await queryRunner.query(`
      DROP INDEX IF EXISTS mission_timesheets_mission_period_unique
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mission_timesheets_unique
        ON mission_timesheets (mission_id, period_month, COALESCE(consultant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    `)

    await queryRunner.query(`
      UPDATE mission_timesheets SET status = 'draft'
       WHERE status NOT IN ('draft', 'submitted', 'validated', 'disputed', 'expected', 'missing', 'not_required')
    `)
    await queryRunner.query(`ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_status_check`)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets ADD CONSTRAINT mission_timesheets_status_check
        CHECK (status IN ('draft', 'submitted', 'validated', 'disputed', 'expected', 'missing', 'not_required'))
    `)

    // Le seuil de marge par espace (§9), et le réglage qui l'accompagne. Éteint
    // par défaut : une alerte de marge qui se déclenche seule le premier jour
    // apprend surtout à ignorer les alertes.
    await queryRunner.query(`
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS margin_alert_threshold_percent numeric
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS margin_alert_threshold_percent`)
    await queryRunner.query(`ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_status_check`)
    await queryRunner.query(`DROP INDEX IF EXISTS mission_timesheets_unique`)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        DROP COLUMN IF EXISTS consultant_id,
        DROP COLUMN IF EXISTS expected_days,
        DROP COLUMN IF EXISTS gap_explanation,
        DROP COLUMN IF EXISTS validated_by_client_at,
        DROP COLUMN IF EXISTS validated_by,
        DROP COLUMN IF EXISTS reminders_sent,
        DROP COLUMN IF EXISTS last_reminder_at,
        DROP COLUMN IF EXISTS updated_at
    `)
  }
}
