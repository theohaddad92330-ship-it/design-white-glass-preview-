import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `library_items` — the workspace-shared knowledge library (sales **templates**
 * and **playbooks**) previously hardcoded in the web `Knowledge` component. Now
 * a real CRUD resource: the team reads, creates, edits and deletes items via
 * `/library-items`. `workspace_id` is the read scope (multi-user Phase 2, mirrors
 * `rag_documents`), `user_id` the created-by attribution. A workspace is lazily
 * seeded with the built-in starter set on first read (`LibraryService`).
 *
 * The `(workspace_id, kind, title)` unique index makes the lazy seed safe under
 * concurrent first reads (the losing insert violates it and is swallowed) and
 * prevents duplicate titles.
 * RLS scopes rows to the owner today (`auth.uid() = user_id`), consistent with
 * the other métier tables; the API additionally scopes reads by workspace.
 * Migration owned here (NestJS = owner of métier tables).
 */
export class LibraryItems1784900000000 implements MigrationInterface {
  public name = 'LibraryItems1784900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS library_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT,
        category TEXT,
        body TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // Primary read: all items in a workspace for one tab (kind).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS library_items_workspace_kind_idx
        ON library_items (workspace_id, kind)
    `)

    // Guards the lazy seed (idempotent ON CONFLICT) and blocks duplicate titles.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS library_items_workspace_kind_title_uidx
        ON library_items (workspace_id, kind, title)
    `)

    await queryRunner.query(`ALTER TABLE library_items ENABLE ROW LEVEL SECURITY`)

    // Idempotent: `CREATE POLICY` has no `IF NOT EXISTS`, so a re-run (a partial
    // prior apply, or two release instances racing `migration:run` on the same
    // deploy) would fail with 42710 "policy already exists" and crash the
    // release — which is exactly what stalled the first prod deploy. Create it
    // only when absent so the migration is safely repeatable, without dropping a
    // policy that may already be protecting live rows.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'library_items'
            AND policyname = 'Users can manage their own library items'
        ) THEN
          CREATE POLICY "Users can manage their own library items"
            ON library_items
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
