import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La grille tarifaire tranchée par Louis le 16/08/2026.
 *
 * Changement de STRUCTURE, pas seulement de chiffres : on ne vend plus des packs
 * de sièges (1 / 3 / 8) mais un poste de travail — **un utilisateur inclus dans
 * chaque palier**, l'équipe s'ajoute siège par siège.
 *
 *   Starter  119 €  ·  80 crédits  · 1 siège · +39 €/siège
 *   Growth   249 €  · 250 crédits  · 1 siège · +59 €/siège
 *   Team / Enterprise : SUR DEVIS — sort de la grille publique (`self_serve`
 *   passe à false). Le palier survit pour les espaces provisionnés à la main.
 *
 * **Les espaces existants basculent** (décision explicite de Louis, contre le
 * grandfathering). C'est la partie irréversible de cette migration : un espace
 * Growth passe de 1600 à 250 crédits et de 8 sièges à 1. Deux garde-fous :
 *
 * 1. `accounts_used` n'est JAMAIS touché. Un espace qui a déjà consommé
 *    au-delà de son nouveau quota garde sa consommation réelle — la remettre à
 *    zéro offrirait des analyses, la plafonner effacerait une trace comptable.
 *    Le solde apparaît simplement à zéro jusqu'au prochain cycle.
 * 2. `extra_seats` reste tel quel : les sièges achetés en plus ont été payés.
 *    Seuls les sièges INCLUS changent, et ils vivent sur le PLAN — un abonnement
 *    ne porte pas son propre total de sièges, il l'obtient de
 *    `plan_definitions.seats + extra_seats`. Toucher la ligne du plan suffit
 *    donc, et évite d'écrire deux vérités pour le même nombre.
 *
 * Les espaces de démonstration et les design-partners (`beta`) ne sont pas
 * concernés : leur quota est posé à la main et n'a jamais suivi la grille.
 */
export class PricingGridAugust20261789400000001 implements MigrationInterface {
  public name = 'PricingGridAugust20261789400000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Le catalogue éditable par l'opérateur ------------------------------
    await queryRunner.query(`
      UPDATE plan_definitions
         SET label = 'Starter',
             price_cents = 11900,
             accounts_limit = 80,
             seats = 1,
             extra_seat_price_cents = 3900,
             self_serve = true
       WHERE key = 'starter'
    `)
    await queryRunner.query(`
      UPDATE plan_definitions
         SET label = 'Growth',
             price_cents = 24900,
             accounts_limit = 250,
             seats = 1,
             extra_seat_price_cents = 5900,
             self_serve = true
       WHERE key = 'growth'
    `)
    // Team / Enterprise : le prix disparaît de la grille publique, pas le palier.
    await queryRunner.query(`
      UPDATE plan_definitions
         SET label = 'Team / Enterprise',
             self_serve = false
       WHERE key = 'team'
    `)

    // ---- Les abonnements en cours ------------------------------------------
    await queryRunner.query(`
      UPDATE subscriptions
         SET accounts_limit = 80
       WHERE plan = 'starter'
    `)
    await queryRunner.query(`
      UPDATE subscriptions
         SET accounts_limit = 250
       WHERE plan = 'growth'
    `)
  }

  /**
   * Le retour arrière restaure la grille de juillet.
   *
   * Il ne peut PAS restaurer un quota qu'un opérateur aurait ajusté à la main
   * entre-temps : `down()` ne sauvegarde rien, il réapplique des valeurs
   * connues. C'est la limite habituelle des migrations de données, et la raison
   * pour laquelle on préfère toujours corriger en avant.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE plan_definitions
         SET label = 'Starter-Solo', price_cents = 11900, accounts_limit = 160, seats = 1,
             extra_seat_price_cents = 2900, self_serve = true
       WHERE key = 'starter'
    `)
    await queryRunner.query(`
      UPDATE plan_definitions
         SET label = 'Growth', price_cents = 59900, accounts_limit = 1600, seats = 8,
             extra_seat_price_cents = 8900, self_serve = true
       WHERE key = 'growth'
    `)
    await queryRunner.query(`
      UPDATE plan_definitions SET label = 'Team', self_serve = true WHERE key = 'team'
    `)
    await queryRunner.query(`UPDATE subscriptions SET accounts_limit = 160 WHERE plan = 'starter'`)
    await queryRunner.query(`UPDATE subscriptions SET accounts_limit = 1600 WHERE plan = 'growth'`)
  }
}
