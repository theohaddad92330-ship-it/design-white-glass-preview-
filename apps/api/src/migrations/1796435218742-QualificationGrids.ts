import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3755 — la grille de qualification propre à l'espace, et l'évaluation d'un
 * compte contre elle.
 *
 * - `qualification_grids` : une VERSION de grille par ligne. Modifier la grille
 *   crée une nouvelle version ; l'ancienne reste, inactive (#3235 : un verdict
 *   garde la version qui l'a produit). Un index partiel tient « une seule grille
 *   active par espace ».
 * - `qualification_criteria` : les critères d'une version — éliminatoire
 *   (PASS/FAIL, sans poids) ou pondéré (poids > 0). Les CHECK reprennent
 *   `QUALIFICATION_CRITERION_KINDS` (`@bellum/contracts`), posés AVANT le code qui
 *   les écrit (GA-11/GA-12).
 * - `account_qualifications` : l'évaluation d'un compte contre UNE version de
 *   grille — ce que l'analyse a évalué (`analysis_evaluations`) et ce que le
 *   commercial a saisi (`manual_evaluations`, qui gagne toujours). Les statuts
 *   vivent dans le JSON, validés par `qualificationCriterionEvaluationSchema`.
 *
 * Toutes les FK portent `ON DELETE CASCADE` : une FK sans cascade a déjà cassé
 * le reset de la démo en silence.
 */
export class QualificationGrids1796435218742 implements MigrationInterface {
  name = 'QualificationGrids1796435218742'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qualification_grids (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        version       integer NOT NULL,
        active        boolean NOT NULL DEFAULT true,
        created_by    uuid,
        created_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT qualification_grids_version_positive CHECK (version > 0),
        CONSTRAINT qualification_grids_workspace_version_unique UNIQUE (workspace_id, version)
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS qualification_grids_one_active
        ON qualification_grids (workspace_id) WHERE active
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qualification_criteria (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        grid_id           uuid NOT NULL REFERENCES qualification_grids (id) ON DELETE CASCADE,
        code              text NOT NULL,
        label             text NOT NULL,
        kind              text NOT NULL,
        weight            numeric,
        description_max   text,
        description_zero  text,
        category          text,
        position          integer NOT NULL DEFAULT 0,
        CONSTRAINT qualification_criteria_kind_check CHECK (kind IN ('eliminatory', 'weighted')),
        CONSTRAINT qualification_criteria_weight_matches_kind CHECK (
          (kind = 'eliminatory' AND weight IS NULL) OR (kind = 'weighted' AND weight > 0)
        ),
        CONSTRAINT qualification_criteria_grid_code_unique UNIQUE (grid_id, code)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_qualifications (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id          uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        account_id            uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
        grid_id               uuid NOT NULL REFERENCES qualification_grids (id) ON DELETE CASCADE,
        grid_version          integer NOT NULL,
        analysis_evaluations  jsonb NOT NULL DEFAULT '[]'::jsonb,
        manual_evaluations    jsonb NOT NULL DEFAULT '[]'::jsonb,
        evaluated_at          timestamptz,
        updated_by            uuid,
        updated_at            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT account_qualifications_account_grid_unique UNIQUE (account_id, grid_id)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_qualifications_workspace_account
        ON account_qualifications (workspace_id, account_id)
    `)

    for (const table of ['qualification_grids', 'account_qualifications']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`DROP POLICY IF EXISTS "${table}_member_read" ON ${table}`)
      await queryRunner.query(`
        CREATE POLICY "${table}_member_read" ON ${table} FOR SELECT
          USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
      `)
    }
    await queryRunner.query(`ALTER TABLE qualification_criteria ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "qualification_criteria_member_read" ON qualification_criteria`)
    await queryRunner.query(`
      CREATE POLICY "qualification_criteria_member_read" ON qualification_criteria FOR SELECT
        USING (grid_id IN (
          SELECT g.id FROM qualification_grids g
           WHERE g.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
        ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_qualifications`)
    await queryRunner.query(`DROP TABLE IF EXISTS qualification_criteria`)
    await queryRunner.query(`DROP TABLE IF EXISTS qualification_grids`)
  }
}
