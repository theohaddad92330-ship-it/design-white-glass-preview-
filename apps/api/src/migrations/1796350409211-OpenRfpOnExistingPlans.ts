import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2957 (#2179.1) — ouvre `rfp` sur les grilles DÉJÀ écrites en base.
 *
 * Même leçon que `1789351994288-OpenCrmNativeOnExistingPlans` : ajouter une
 * clé au contrat et au catalogue par défaut ne touche AUCUNE grille déjà
 * provisionnée, et `@RequireFeature('rfp')` fermerait alors `/rfp` en silence
 * à tous les espaces qui s'en servent aujourd'hui. La porte existe pour que la
 * grille puisse se resserrer depuis le back-office — pas pour changer ce que
 * voit un client au déploiement.
 *
 * Additive (aucune clé retirée ni réordonnée) et idempotente (`WHERE NOT @>`).
 */
export class OpenRfpOnExistingPlans1796350409211 implements MigrationInterface {
  public name = 'OpenRfpOnExistingPlans1796350409211'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE plan_definitions
          SET features = COALESCE(features, '[]'::jsonb) || to_jsonb($1::text), updated_at = NOW()
        WHERE NOT COALESCE(features, '[]'::jsonb) @> to_jsonb($1::text)`,
      ['rfp'],
    )
  }

  public async down(): Promise<void> {
    // Retirer la clé fermerait /rfp à tous les espaces : on ne redescend pas.
    throw new Error('down migrations are not supported')
  }
}
