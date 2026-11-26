import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Deux arbitrages de Louis (31/07), portés aux lignes DÉJÀ en base — les défauts
 * embarqués ne suffisent pas : le catalogue live (`plan_definitions`) fait foi
 * partout, donc une prod déjà seedée garderait l'ancienne grille.
 *
 *  1. Le siège supplémentaire Growth passe de 99 € à **89 €**.
 *  2. L'écran **Besoins** descend de Growth à **Team** : un client à 259 € qui ne
 *     voit aucun besoin de ses comptes n'a pas de raison de rester. Growth le
 *     portait déjà (grille cumulative) — seule la ligne `team` change.
 *
 * Les deux UPDATE sont volontairement ÉTROITS, comme
 * `PlanFeaturesGridRepair1788259845112` : ils ne touchent que les lignes qui
 * portent encore EXACTEMENT la valeur embarquée précédente. Un prix ou une
 * grille posés à la main dans le backoffice sont plus récents que cette
 * migration et sortent intacts. Idempotent : rejouée, elle ne trouve plus rien.
 */
export class TeamNeedsAndGrowthSeatPrice1788300000000 implements MigrationInterface {
  public name = 'TeamNeedsAndGrowthSeatPrice1788300000000'

  /** L'ancien prix de siège Growth — la seule valeur qu'on accepte de remplacer. */
  private static readonly PREVIOUS_GROWTH_SEAT_CENTS = 9900

  /** La nouvelle valeur. */
  private static readonly GROWTH_SEAT_CENTS = 8900

  /** Signature triée de la grille Team précédente : c'est elle, et rien d'autre,
   *  qui reçoit `needs`. */
  private static readonly PREVIOUS_TEAM_GRID_SORTED = [
    'chat_ai',
    'discover',
    'exports',
    'knowledge_base',
    'team_workspace',
    'watchlist',
  ]

  /** La grille Team d'après, dans l'ordre du contrat. */
  private static readonly NEXT_TEAM_GRID = [
    'exports',
    'chat_ai',
    'discover',
    'watchlist',
    'knowledge_base',
    'team_workspace',
    'needs',
  ]

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE plan_definitions
          SET extra_seat_price_cents = $1, updated_at = NOW()
        WHERE key = 'growth' AND extra_seat_price_cents = $2`,
      [
        TeamNeedsAndGrowthSeatPrice1788300000000.GROWTH_SEAT_CENTS,
        TeamNeedsAndGrowthSeatPrice1788300000000.PREVIOUS_GROWTH_SEAT_CENTS,
      ],
    )

    await queryRunner.query(
      `UPDATE plan_definitions
          SET features = $1::jsonb, updated_at = NOW()
        WHERE key = 'team'
          AND (
            SELECT array_agg(value ORDER BY value)
              FROM jsonb_array_elements_text(features)
          ) = $2::text[]`,
      [
        JSON.stringify(TeamNeedsAndGrowthSeatPrice1788300000000.NEXT_TEAM_GRID),
        TeamNeedsAndGrowthSeatPrice1788300000000.PREVIOUS_TEAM_GRID_SORTED,
      ],
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
