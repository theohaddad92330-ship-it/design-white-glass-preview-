import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Équipe › Recherches (Théo D team-recherches.N1/N2) — l'historique des recherches
 * Découvrir d'un espace, lisible par tout membre.
 *
 * Jusqu'ici l'historique de Découvrir vivait dans le navigateur de chacun (30 jours, 20 entrées) :
 * une page d'équipe ne peut pas lire le navigateur d'un collègue. Cette table garde, par
 * personne et par périmètre, la recherche LANCÉE — jamais ce qu'elle a trouvé (seulement le
 * nombre de comptes et ceux déjà dans l'espace).
 *
 * Additive + idempotente. Une relance du même périmètre remonte la ligne (clé `filters_key`),
 * comme `recordSearch` côté navigateur.
 */
export class TeamResearchEntries1796575071694 implements MigrationInterface {
  public name = 'TeamResearchEntries1796575071694'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS team_research_entries (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  uuid NOT NULL,
        user_id       uuid NOT NULL,
        title         text NOT NULL,
        scope_label   text,
        filters       jsonb NOT NULL,
        filters_key   text NOT NULL,
        result_count  integer,
        account_ids   uuid[] NOT NULL DEFAULT '{}',
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS team_research_entries_user_key_idx
        ON team_research_entries (workspace_id, user_id, filters_key)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS team_research_entries_workspace_updated_idx
        ON team_research_entries (workspace_id, updated_at DESC)
    `)
    await queryRunner.query(`ALTER TABLE team_research_entries ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'team_research_entries'
            AND policyname = 'Members can read their workspace research'
        ) THEN
          CREATE POLICY "Members can read their workspace research"
            ON team_research_entries
            FOR SELECT
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
