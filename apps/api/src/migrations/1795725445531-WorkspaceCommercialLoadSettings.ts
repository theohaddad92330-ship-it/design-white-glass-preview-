import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2035.11 — LE RÉGLAGE D'ESPACE DE LA CHARGE COMMERCIALE.
 *
 * ── UNE CAPACITÉ, JAMAIS UN SCORE ──────────────────────────────────────────────
 * `max_open_needs` borne le nombre de besoins ouverts qu'un commercial porte
 * avant d'être considéré à charge (`project_needs.owner_id` /
 * `project_needs.status`, les deux SEULES colonnes qui existaient avant ce
 * lot — rien d'autre n'a été inventé). Ce n'est ni une probabilité ni un score
 * pondéré : un entier comparé à un compte réel.
 *
 * Même forme que `workspace_rules` / `workspace_reverse_market_settings` :
 * une ligne PAR ESPACE, créée seulement au premier changement. Aucune ligne =
 * le défaut de code (`DEFAULT_MAX_OPEN_NEEDS = 15`) — comportement inchangé
 * tant que personne n'a réglé quoi que ce soit.
 *
 * RLS : un filet, pas la serrure — l'autorisation réelle (`team:manage`) vit
 * dans le service ; la politique protège l'accès direct par JWT Supabase.
 */
export class WorkspaceCommercialLoadSettings1795725445531 implements MigrationInterface {
  name = 'WorkspaceCommercialLoadSettings1795725445531'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_commercial_load_settings (
        workspace_id uuid PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
        max_open_needs integer NOT NULL DEFAULT 15,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_commercial_load_settings_max_open_needs_check
          CHECK (max_open_needs BETWEEN 1 AND 100)
      )
    `)

    await queryRunner.query(`ALTER TABLE workspace_commercial_load_settings ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "workspace_commercial_load_settings_member_read" ON workspace_commercial_load_settings`,
    )
    await queryRunner.query(`
      CREATE POLICY "workspace_commercial_load_settings_member_read" ON workspace_commercial_load_settings FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_commercial_load_settings`)
  }
}
