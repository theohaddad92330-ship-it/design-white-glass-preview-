import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BEL-SC-224 (#3253, P0) — l'historique des diagnostics du maillon faible
 * commercial. Une ligne par calcul, jamais un UPDATE en place : la doctrine
 * « historique des diagnostics » + « explication lorsqu'il change » suppose
 * de pouvoir relire le diagnostic PRÉCÉDENT, pas seulement le dernier.
 *
 * `primary_bottleneck` NULLABLE : « pas de maillon désignable » est un
 * diagnostic valide (pas assez de signal), jamais une ligne absente.
 */
export class WeakestLinkDiagnoses1796373104813 implements MigrationInterface {
  name = 'WeakestLinkDiagnoses1796373104813'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS weakest_link_diagnoses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        computed_at timestamptz NOT NULL,
        primary_bottleneck jsonb,
        secondary_bottlenecks jsonb NOT NULL DEFAULT '[]'::jsonb,
        not_evaluable_families jsonb NOT NULL DEFAULT '[]'::jsonb,
        confidence text NOT NULL,
        change_explanation text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS weakest_link_diagnoses_workspace_computed_idx
        ON weakest_link_diagnoses (workspace_id, computed_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS weakest_link_diagnoses_workspace_computed_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS weakest_link_diagnoses`)
  }
}
