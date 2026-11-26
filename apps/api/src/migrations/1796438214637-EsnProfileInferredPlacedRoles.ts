import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * MÉTIERS PLACÉS DÉDUITS du contexte de l'espace (décision Louis 11/10/2026 —
 * « Tout le contexte, et sinon on pose la question »).
 *
 * Stockés À CÔTÉ du déclaré, jamais dedans : `placed_roles` reste ce que
 * l'humain a écrit, et seule une correction humaine l'écrit.
 *
 *  · `inferred_placed_roles` — la sortie de `inferPlacedRoles` (contracts) :
 *    `[{ role, terms, score, evidence: [{ source, field?, excerpt }], evidenceCount }]`.
 *    Contrainte NOMMÉE (GA-177) sur la seule FORME — un tableau — comme
 *    `accounts_discover_origin_criteria_shape_check` ;
 *  · `inferred_placed_roles_at` — quand la déduction a tourné. `NULL` = jamais :
 *    c'est la cible du rattrapage de nuit (`PlacedRolesInferenceScheduler`),
 *    jamais une collecte rejouée ;
 *  · `dismissed_inferred_roles` — les métiers déduits que l'humain a RETIRÉS :
 *    une correction humaine gagne toujours, aucun recalcul ne les ramène.
 *
 * Additive, posée avant tout code qui écrit (GA-11/GA-12).
 */
export class EsnProfileInferredPlacedRoles1796438214637 implements MigrationInterface {
  name = 'EsnProfileInferredPlacedRoles1796438214637'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles
        ADD COLUMN IF NOT EXISTS inferred_placed_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS inferred_placed_roles_at timestamptz,
        ADD COLUMN IF NOT EXISTS dismissed_inferred_roles text[] NOT NULL DEFAULT '{}'
    `)
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS esn_profiles_inferred_placed_roles_shape_check
    `)
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD CONSTRAINT esn_profiles_inferred_placed_roles_shape_check
        CHECK (jsonb_typeof(inferred_placed_roles) = 'array')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS esn_profiles_inferred_placed_roles_shape_check`,
    )
    await queryRunner.query(`
      ALTER TABLE esn_profiles
        DROP COLUMN IF EXISTS dismissed_inferred_roles,
        DROP COLUMN IF EXISTS inferred_placed_roles_at,
        DROP COLUMN IF EXISTS inferred_placed_roles
    `)
  }
}
