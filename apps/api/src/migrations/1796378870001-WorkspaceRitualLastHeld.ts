import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3298 (suite #3271.8) — LA MARQUE LÉGÈRE DE DERNIÈRE TENUE D'UN RITUEL.
 *
 * ── UNE DATE, UN AUTEUR, RIEN D'AUTRE ──────────────────────────────────────
 * « Date suivante » suppose de savoir QUAND le rituel a été tenu, et rien ne
 * le journalise — le catalogue (`ritual.ts`) refuse explicitement toute
 * séance enregistrée ou compte rendu : le dépôt porte déjà deux journaux de
 * décision, un troisième ferait un troisième endroit où chercher. Cette table
 * reste volontairement PAUVRE : ni note, ni ordre du jour tenu, ni liste de
 * participants réels — un fait daté, pas un contenu à relire.
 *
 * ── MÊME FORME QUE `workspace_ritual_preferences` (1796374065850) ─────────
 * Une ligne PAR (espace, rituel), upsertée à chaque marquage — jamais un
 * historique de séances. `ritual_key` contraint aux cinq clés RÉELLES du
 * catalogue (`RITUAL_KEYS`, `ritual.ts`, GA-11/GA-12).
 *
 * RLS : un filet, pas la serrure — l'autorisation réelle (`team:manage`) vit
 * dans le service ; la politique protège l'accès direct par JWT Supabase.
 */
export class WorkspaceRitualLastHeld1796378870001 implements MigrationInterface {
  name = 'WorkspaceRitualLastHeld1796378870001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_ritual_last_held (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        ritual_key text NOT NULL,
        held_at timestamptz NOT NULL,
        held_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_ritual_last_held_ritual_key_check
          CHECK (ritual_key IN ('daily', 'weekly', 'monthly', 'quarterly', 'rank1'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_ritual_last_held_workspace_ritual_idx
        ON workspace_ritual_last_held (workspace_id, ritual_key)
    `)

    await queryRunner.query(`ALTER TABLE workspace_ritual_last_held ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "workspace_ritual_last_held_member_read" ON workspace_ritual_last_held`,
    )
    await queryRunner.query(`
      CREATE POLICY "workspace_ritual_last_held_member_read" ON workspace_ritual_last_held FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_ritual_last_held`)
  }
}
