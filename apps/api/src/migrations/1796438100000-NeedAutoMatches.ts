import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `need_auto_matches` — #2916 / #2399.2 « Matcher un besoin entrant ».
 *
 * DÉCISION LOUIS 11/10/2026 (`c93_matching_auto_besoin_entrant`) : à chaque
 * besoin qui entre dans un espace où la routine `incoming_need_matching` est
 * activée, un `MatchRun` est écrit SANS geste humain. Renversement daté de la
 * règle « les routines préparent, aucune n'écrit », pour cette automatisation
 * seulement — rien ne sort du produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE, ET POURQUOI `need_id` EN CLÉ PRIMAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'idempotence (« un besoin = un run automatique ») ne se tient pas par une
 * lecture préalable — deux événements simultanés liraient tous deux « rien ».
 * Elle se tient par la CLÉ : `INSERT … ON CONFLICT (need_id) DO NOTHING`, et
 * seul celui qui insère met en file.
 *
 * La ligne porte aussi ce qu'aucun `match_runs` ne peut porter : un besoin
 * NON classé, et pourquoi (`capped` — plafond quotidien ; `no_criteria` —
 * aucune compétence ; `unknown` — délai dépassé, un timeout n'est pas un échec).
 *
 * `run_id` : `ON DELETE SET NULL` — un journal purgé ne fait pas disparaître le
 * fait qu'un run automatique a eu lieu. `need_id` : `ON DELETE CASCADE` — sans
 * besoin, la ligne ne dit plus rien.
 */
export class NeedAutoMatches1796438100000 implements MigrationInterface {
  public name = 'NeedAutoMatches1796438100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS need_auto_matches (
        need_id uuid PRIMARY KEY REFERENCES project_needs(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        run_id uuid REFERENCES match_runs(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`ALTER TABLE need_auto_matches DROP CONSTRAINT IF EXISTS need_auto_matches_status_check`)
    await queryRunner.query(`
      ALTER TABLE need_auto_matches
        ADD CONSTRAINT need_auto_matches_status_check
        CHECK (status IN ('queued', 'done', 'unknown', 'failed', 'capped', 'no_criteria'))
    `)

    // Le plafond quotidien compte les runs du jour PAR ESPACE : c'est la lecture
    // qui précède chaque mise en file.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS need_auto_matches_workspace_idx
        ON need_auto_matches (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      COMMENT ON TABLE need_auto_matches IS
        'Matching AUTOMATIQUE d un besoin entrant (#2916, c93). Une ligne par besoin (idempotence). Rien ne sort du produit : un journal interne lu sur la fiche besoin.'
    `)

    await queryRunner.query(`ALTER TABLE need_auto_matches ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'need_auto_matches' AND policyname = 'need_auto_matches_own_workspace'
        ) THEN
          CREATE POLICY need_auto_matches_own_workspace ON need_auto_matches
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      EXCEPTION
        WHEN undefined_function OR undefined_table OR undefined_object THEN NULL;
      END
      $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS need_auto_matches`)
  }
}
