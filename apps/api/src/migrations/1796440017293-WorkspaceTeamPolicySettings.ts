import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE (décision Louis du 11/10/2026 : « construis
 * tout ce qu'il faut »).
 *
 * Jusqu'ici, le plan de journée de Laura finissait par « Non pris en compte : …
 * la politique d'équipe » — aucune source n'existait. Ce réglage d'ESPACE, saisi
 * par un gestionnaire (`team:manage`, Réglages › Équipe), en devient la source.
 *
 * ── MÊME FORME QUE `workspace_commercial_load_settings` ────────────────────────
 * Une ligne par espace, créée au premier enregistrement ; aucune ligne = « aucune
 * politique d'équipe saisie », et le plan garde son comportement d'avant. Les
 * plages sont du JSONB (`[{startMinute, endMinute}]`, minutes depuis minuit) :
 * leur FORME fine est tenue par le contrat (`team-policy.ts`), la base tient ce
 * qu'elle sait tenir — un tableau, au plus quatre plages.
 *
 * ── LES CONTRAINTES AVANT LE CODE QUI ÉCRIT (GA-11/GA-12) ──────────────────────
 * Mêmes bornes que `TEAM_POLICY_*` dans le contrat : 1-12 réunions par jour,
 * 1-200 appels par jour. `NULL` = « non saisi », jamais 0 (GA-18/GA-19) — un
 * plafond à zéro se dit en effaçant la règle.
 *
 * RLS : un filet, pas la serrure — l'autorisation réelle (`team:manage` en
 * écriture) vit dans le contrôleur ; la politique protège l'accès direct.
 *
 * Horodatage : `pnpm --filter @bellum/api migration:next` (GA-372).
 */
export class WorkspaceTeamPolicySettings1796440017293 implements MigrationInterface {
  name = 'WorkspaceTeamPolicySettings1796440017293'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_team_policy_settings (
        workspace_id uuid PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
        prospecting_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
        forbidden_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
        max_meetings_per_day integer,
        daily_call_target integer,
        updated_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_team_policy_settings_prospecting_windows_check CHECK (
          jsonb_typeof(prospecting_windows) = 'array' AND jsonb_array_length(prospecting_windows) <= 4
        ),
        CONSTRAINT workspace_team_policy_settings_forbidden_windows_check CHECK (
          jsonb_typeof(forbidden_windows) = 'array' AND jsonb_array_length(forbidden_windows) <= 4
        ),
        CONSTRAINT workspace_team_policy_settings_max_meetings_check CHECK (
          max_meetings_per_day IS NULL OR (max_meetings_per_day >= 1 AND max_meetings_per_day <= 12)
        ),
        CONSTRAINT workspace_team_policy_settings_daily_calls_check CHECK (
          daily_call_target IS NULL OR (daily_call_target >= 1 AND daily_call_target <= 200)
        )
      )
    `)

    await queryRunner.query(`ALTER TABLE workspace_team_policy_settings ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "workspace_team_policy_settings_member_read" ON workspace_team_policy_settings`,
    )
    await queryRunner.query(`
      CREATE POLICY "workspace_team_policy_settings_member_read" ON workspace_team_policy_settings FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_team_policy_settings`)
  }
}
