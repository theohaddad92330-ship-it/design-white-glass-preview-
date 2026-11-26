import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BEL-SC-242 (#3271.10, .12) — « laisser le workspace personnaliser », et
 * « proposer de supprimer un rituel inutile ».
 *
 * ── UNE DÉSACTIVATION, JAMAIS UNE SUPPRESSION ──────────────────────────────
 * Le catalogue des cinq rituels reste en CODE (`ritual.ts`) : ce qu'un espace
 * personnalise est UNIQUEMENT s'il tient ou non un rituel donné — jamais son
 * contenu, sa durée ni son ordre du jour, qui resteraient alors un standard
 * d'équipe éditable sans revue. « On archive, on ne supprime pas » : une ligne
 * ici veut dire « masqué », le rituel reste nommé et réactivable.
 *
 * ── MÊME FORME QUE `workspace_commercial_load_settings` / `finance_margin_targets` ──
 * Une ligne créée seulement au premier changement ; aucune ligne = le défaut
 * (rituel affiché, comportement inchangé pour tout espace qui n'a jamais rien
 * réglé). `ritual_key` est contraint aux cinq clés RÉELLES du catalogue
 * (`RITUAL_KEYS`, `ritual.ts`) — un espace ne peut pas «désactiver» un rituel
 * qui n'existe pas, ce qui serait un réglage mort dont personne ne saurait
 * jamais qu'il ne fait rien.
 *
 * RLS : un filet, pas la serrure — l'autorisation réelle (`team:manage`) vit
 * dans le service ; la politique protège l'accès direct par JWT Supabase.
 */
export class WorkspaceRitualPreferences1796374065850 implements MigrationInterface {
  name = 'WorkspaceRitualPreferences1796374065850'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_ritual_preferences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        ritual_key text NOT NULL,
        disabled boolean NOT NULL DEFAULT false,
        updated_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_ritual_preferences_ritual_key_check
          CHECK (ritual_key IN ('daily', 'weekly', 'monthly', 'quarterly', 'rank1'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_ritual_preferences_workspace_ritual_idx
        ON workspace_ritual_preferences (workspace_id, ritual_key)
    `)

    await queryRunner.query(`ALTER TABLE workspace_ritual_preferences ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "workspace_ritual_preferences_member_read" ON workspace_ritual_preferences`,
    )
    await queryRunner.query(`
      CREATE POLICY "workspace_ritual_preferences_member_read" ON workspace_ritual_preferences FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_ritual_preferences`)
  }
}
