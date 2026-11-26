import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Commentaire d'équipe (cockpit manager §10, « Capitalisation & collaboration »).
 *
 * Table `team_comments` : un fil de commentaires partagés à l'échelle du workspace
 * — une idée, un retour terrain, un point de coordination — optionnellement
 * rattaché à un compte (`account_id`, `ON DELETE SET NULL` : supprimer un compte
 * n'efface pas la mémoire d'équipe). Rien d'inventé, que du texte réellement écrit.
 *
 * RLS (défense en profondeur) :
 *  - les membres du workspace lisent et écrivent le fil de leur espace ;
 *  - un auteur peut supprimer SON commentaire.
 *
 * Additive + idempotente (`IF NOT EXISTS` partout, garde `pg_policies`).
 */
export class TeamComments1788230518044 implements MigrationInterface {
  public name = 'TeamComments1788230518044'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS team_comments (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   uuid NOT NULL,
        author_user_id uuid NOT NULL,
        body           text NOT NULL,
        account_id     uuid REFERENCES accounts(id) ON DELETE SET NULL,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `)

    // Fil trié récent-first, scopé workspace : l'index sert la lecture du cockpit.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS team_comments_workspace_created_idx
        ON team_comments (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`ALTER TABLE team_comments ENABLE ROW LEVEL SECURITY`)

    // Les membres du workspace lisent le fil de leur espace.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'team_comments'
            AND policyname = 'Members can read their workspace comments'
        ) THEN
          CREATE POLICY "Members can read their workspace comments"
            ON team_comments
            FOR SELECT
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      END $$;
    `)

    // Un membre poste dans le fil de son workspace, sous sa propre identité.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'team_comments'
            AND policyname = 'Members can post in their workspace'
        ) THEN
          CREATE POLICY "Members can post in their workspace"
            ON team_comments
            FOR INSERT
            WITH CHECK (
              auth.uid() = author_user_id
              AND workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      END $$;
    `)

    // Un auteur supprime SON commentaire.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'team_comments'
            AND policyname = 'Authors can delete their own comment'
        ) THEN
          CREATE POLICY "Authors can delete their own comment"
            ON team_comments
            FOR DELETE
            USING (auth.uid() = author_user_id);
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
