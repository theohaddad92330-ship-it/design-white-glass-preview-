import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3245 (reste de #3209.3, « BUDGET D'EFFORT ») — la première pièce manquante
 * nommée par l'épopée : « pas de réglage d'heures commerciales par
 * commercial ». Décision du lot SOURCES-28-09 : ce point est classé **A**
 * (donnée/source absente du produit) — on AJOUTE la source plutôt que de la
 * laisser en reste.
 *
 * Un réglage vit à un seul endroit (GA-26) : `weekly_available_hours` rejoint
 * `workspace_commercial_load_settings`, la table de production qui porte déjà
 * les deux autres plafonds du même sujet (charge commerciale, #2035.11) —
 * jamais une troisième table pour un concept voisin.
 *
 * NULLABLE : une fiche déjà en base n'a pas déclaré ses heures disponibles, et
 * `NULL` se lit « non renseigné », jamais 0 heure (GA-18/GA-19) — 0 heure
 * dirait « ce commercial ne peut rien faire cette semaine », l'inverse d'une
 * absence de réglage.
 *
 * La contrainte SQL AVANT le code qui écrit (GA-11/GA-12) : 1-80 h/semaine,
 * la même borne que `WEEKLY_AVAILABLE_HOURS_BOUNDS`
 * (`packages/contracts/src/schemas/workspace-capacity.ts`).
 */
export class WorkspaceWeeklyAvailableHours1796376490526 implements MigrationInterface {
  name = 'WorkspaceWeeklyAvailableHours1796376490526'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        ADD COLUMN IF NOT EXISTS weekly_available_hours integer
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        DROP CONSTRAINT IF EXISTS workspace_commercial_load_settings_weekly_available_hours_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        ADD CONSTRAINT workspace_commercial_load_settings_weekly_available_hours_check CHECK (
          weekly_available_hours IS NULL OR (weekly_available_hours >= 1 AND weekly_available_hours <= 80)
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        DROP CONSTRAINT IF EXISTS workspace_commercial_load_settings_weekly_available_hours_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings DROP COLUMN IF EXISTS weekly_available_hours
    `)
  }
}
