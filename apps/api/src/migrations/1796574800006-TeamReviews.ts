import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo D team-review.N1 — le compte rendu d'un « point d'équipe » : trois écrans
 * (sujets → décisions → relecture) dont les décisions deviennent des actions du
 * plan. Cette table garde la TRACE du point (qui, quand, la note, l'issue de
 * chaque décision) ; les actions elles-mêmes vivent dans `action_plan_items`.
 *
 * Additive et idempotente. RLS : les membres de l'espace lisent les points de
 * leur espace ; l'écriture passe par l'API (rôle de service).
 */
export class TeamReviews1796574800006 implements MigrationInterface {
  public name = 'TeamReviews1796574800006'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS team_reviews (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  uuid NOT NULL,
        held_by       uuid NOT NULL,
        note          text,
        no_new_action boolean NOT NULL DEFAULT false,
        decisions     jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS team_reviews_workspace_created_idx
        ON team_reviews (workspace_id, created_at DESC)
    `)
    await queryRunner.query(`ALTER TABLE team_reviews ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'team_reviews' AND policyname = 'Members can read their workspace team reviews'
        ) THEN
          CREATE POLICY "Members can read their workspace team reviews"
            ON team_reviews
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
