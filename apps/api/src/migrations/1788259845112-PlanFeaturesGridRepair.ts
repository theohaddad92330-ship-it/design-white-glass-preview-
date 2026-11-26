import { MigrationInterface, QueryRunner } from 'typeorm'
import { PLAN_CATALOG_DEFAULTS, PLAN_KEYS } from '../modules/credits/plan-catalog.defaults'

/**
 * Répare une grille de features restée au SEED « tout ouvert » d'origine.
 *
 * Ce qui s'est passé : la toute première version du gating seedait chaque palier
 * avec la liste complète des features d'alors (`exports`, `chat_ai`, `crm_sync`,
 * `mcp_assistant`, `public_api`). C'est cette version qui a atteint la base de
 * production. La migration qui pose la grille commerciale
 * (`PlanFeatures1788251437886`) ne s'applique QUE si aucun palier ne porte
 * encore de grille — garde volontaire, pour ne jamais écraser une décision
 * d'opérateur — donc elle n'a rien fait : les lignes n'étaient pas vides, elles
 * étaient toutes identiques. Résultat côté écran : les trois cartes annonçaient
 * exactement les mêmes fonctions, et « Tout Team, plus : » ne listait rien.
 *
 * La réparation est délibérément ÉTROITE : on ne réécrit que les lignes dont la
 * grille est EXACTEMENT cet ensemble de cinq clés, comparé comme un ensemble
 * (l'ordre en base n'est pas garanti). Une grille posée à la main depuis le
 * backoffice — même partiellement — n'a pas cette signature et sort intacte.
 * Aucune ligne ne peut donc perdre un réglage volontaire.
 */
export class PlanFeaturesGridRepair1788259845112 implements MigrationInterface {
  public name = 'PlanFeaturesGridRepair1788259845112'

  /** La signature du seed d'origine, triée — c'est elle, et rien d'autre, qu'on
   *  accepte de remplacer. */
  private static readonly LEGACY_SEED_SORTED = ['chat_ai', 'crm_sync', 'exports', 'mcp_assistant', 'public_api']

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of PLAN_KEYS) {
      await queryRunner.query(
        `UPDATE plan_definitions
            SET features = $1::jsonb, updated_at = NOW()
          WHERE key = $2
            AND (
              SELECT array_agg(value ORDER BY value)
                FROM jsonb_array_elements_text(features)
            ) = $3::text[]`,
        [
          JSON.stringify(PLAN_CATALOG_DEFAULTS[key].features),
          key,
          PlanFeaturesGridRepair1788259845112.LEGACY_SEED_SORTED,
        ],
      )
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
