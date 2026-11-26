import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le siège supplémentaire devient PROPORTIONNEL au palier : 29 € (Starter-Solo) ·
 * 59 € (Team) · 99 € (Growth) — décision Louis 26/07.
 *
 * Le mécanisme existait déjà (colonne par plan, migration `1786400000000`) ; les
 * trois paliers étaient simplement posés au même 2900. Ce qui change ici, ce sont
 * les VALEURS : un siège consomme le pool de crédits du plan, donc il coûte plus
 * cher là où le pool est plus riche. Aucun palier n'augmente pour un client
 * existant côté Starter (2900 inchangé) — seuls Team et Growth montent, et
 * uniquement pour les PROCHAINS achats de siège (le checkout lit le catalogue au
 * moment de la commande ; les lignes Stripe déjà souscrites gardent leur prix).
 *
 * `WHERE extra_seat_price_cents = 2900` : on ne touche QUE les lignes encore à
 * l'ancien défaut. Un opérateur qui a déjà fixé son propre prix dans le
 * backoffice le garde — une migration ne rejoue pas par-dessus une décision plus
 * récente que la sienne. Idempotent : rejouée, elle ne trouve plus rien à mettre
 * à jour.
 */
export class PlanSeatPriceTiers1788251437219 implements MigrationInterface {
  public name = 'PlanSeatPriceTiers1788251437219'

  /** Les paliers dont le prix de siège monte, et leur nouveau prix en centimes. */
  private static readonly TIERS: ReadonlyArray<[key: string, cents: number]> = [
    ['team', 5900],
    ['growth', 9900],
  ]

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, cents] of PlanSeatPriceTiers1788251437219.TIERS) {
      await queryRunner.query(
        `UPDATE plan_definitions
            SET extra_seat_price_cents = $1, updated_at = NOW()
          WHERE key = $2 AND extra_seat_price_cents = 2900`,
        [cents, key],
      )
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
