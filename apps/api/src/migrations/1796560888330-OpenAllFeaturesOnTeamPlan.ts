import { MigrationInterface, QueryRunner } from 'typeorm'
import { ALL_PLAN_FEATURES } from '@bellum/contracts'

/**
 * ENTREPRISE-TOUT #4381 — le plan `team` (« Entreprise (sur devis) ») ouvre TOUTES
 * les fonctions, y compris sur la grille DÉJÀ écrite en base.
 *
 * Même leçon que `1796350409211-OpenRfpOnExistingPlans` : changer le catalogue par
 * défaut ne touche pas la ligne provisionnée. Additive (les clés déjà accordées
 * restent) et idempotente. Seule la ligne `team` est visée ; les quotas ne bougent pas.
 */
export class OpenAllFeaturesOnTeamPlan1796560888330 implements MigrationInterface {
  public name = 'OpenAllFeaturesOnTeamPlan1796560888330'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE plan_definitions
          SET features = $1::jsonb, updated_at = NOW()
        WHERE key = 'team' AND features IS DISTINCT FROM $1::jsonb`,
      [JSON.stringify([...ALL_PLAN_FEATURES])],
    )
  }

  public async down(): Promise<void> {
    // Refermer des fonctions à des espaces qui s'en servent : on ne redescend pas.
    throw new Error('down migrations are not supported')
  }
}
