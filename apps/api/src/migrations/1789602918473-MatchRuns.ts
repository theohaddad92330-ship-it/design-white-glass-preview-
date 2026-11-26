import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le JOURNAL du matching (PDF 4 §13, obligation de journalisation).
 *
 * Jusqu'ici le classement était un calcul à la demande dont rien ne restait :
 * on pouvait montrer un résultat, jamais expliquer celui d'il y a trois mois.
 * L'AI Act demande l'inverse — « chaque exécution écrit : critères, poids,
 * profils évalués, scores, décision humaine finale ».
 *
 * Trois tables, trois rôles :
 *
 *  - `match_weight_versions` est APPEND-ONLY. Une pondération qui change sans
 *    laisser de trace rend inexplicable un classement antérieur, et c'est
 *    précisément celui qu'on vient demander d'expliquer. La version courante est
 *    la plus récente ; revenir en arrière consiste à en écrire une nouvelle,
 *    jamais à effacer.
 *  - `match_runs` fige les CRITÈRES et les POIDS employés. Le besoin peut être
 *    modifié ensuite : l'explication doit rester celle du jour du calcul.
 *  - `match_run_entries` garde le détail par profil, borné. Au-delà de la borne
 *    le run se marque `truncated` — un journal qui coupe en silence se lirait
 *    comme un vivier plus petit qu'il n'est.
 */
export class MatchRuns1789602918473 implements MigrationInterface {
  public name = 'MatchRuns1789602918473'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS match_weight_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        weights jsonb NOT NULL,
        threshold integer NOT NULL DEFAULT 60,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS match_weight_versions_workspace_idx
        ON match_weight_versions (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS match_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id uuid NOT NULL,
        need_id uuid REFERENCES project_needs(id) ON DELETE SET NULL,
        consultant_id uuid REFERENCES consultants(id) ON DELETE SET NULL,
        direction text NOT NULL DEFAULT 'need_to_pool',
        criteria jsonb NOT NULL,
        weights jsonb NOT NULL,
        weights_version_id uuid REFERENCES match_weight_versions(id) ON DELETE SET NULL,
        threshold integer NOT NULL,
        evaluated_count integer NOT NULL DEFAULT 0,
        prefiltered_count integer NOT NULL DEFAULT 0,
        truncated boolean NOT NULL DEFAULT false,
        exclusion_counts jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT match_runs_direction_check CHECK (direction IN ('need_to_pool', 'talent_to_needs'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS match_runs_workspace_idx ON match_runs (workspace_id, created_at DESC)
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS match_runs_need_idx ON match_runs (need_id, created_at DESC)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS match_run_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES match_runs(id) ON DELETE CASCADE,
        consultant_id uuid,
        need_id uuid,
        rank integer NOT NULL,
        correspondence_score integer NOT NULL,
        pushable_score integer NOT NULL,
        bucket text NOT NULL,
        axes jsonb NOT NULL DEFAULT '[]'::jsonb,
        exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS match_run_entries_run_idx ON match_run_entries (run_id, rank)`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS match_run_entries_consultant_idx ON match_run_entries (consultant_id, created_at DESC)
    `)

    // Le score poussable au moment du POSITIONNEMENT — sans lui, la calibration
    // du §14 n'a rien à corréler : on ne saurait pas dire quel score a produit
    // quels entretiens, donc pas si le score prédit quoi que ce soit.
    await queryRunner.query(`
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS pushable_score integer
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE submissions DROP COLUMN IF EXISTS pushable_score`)
    await queryRunner.query(`DROP TABLE IF EXISTS match_run_entries`)
    await queryRunner.query(`DROP TABLE IF EXISTS match_runs`)
    await queryRunner.query(`DROP TABLE IF EXISTS match_weight_versions`)
  }
}
