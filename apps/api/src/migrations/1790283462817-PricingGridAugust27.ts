import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La grille tarifaire tranchée par Louis le 27/08/2026.
 *
 * Changement de STRUCTURE encore une fois, et dans l'autre sens : on ne vend
 * plus deux paliers gradués avec des sièges à l'unité, mais **un seul poste de
 * travail complet**.
 *
 *   Free        — la démonstration publique. Pas un plan, rien à écrire ici.
 *   Growth      199 €  ·  250 crédits  ·  1 siège  ·  AUCUN siège achetable
 *   Entreprise  — sur devis, dès le deuxième utilisateur (`team` côté code).
 *
 * **`starter` sort de la VENTE, il n'est pas supprimé.** `self_serve` passe à
 * false, le prix et le quota restent ceux qu'ont payés les espaces qui l'ont
 * souscrit. Effacer la ligne rendrait illisibles les abonnements qui la
 * portent — et GA-08 interdit de retirer une valeur d'énumération.
 *
 * **Aucun abonnement en cours n'est touché**, et c'est délibéré, contrairement
 * à la migration d'août qui basculait tout le monde. La raison est factuelle
 * (Louis, 27/08) : il n'y a aujourd'hui que des espaces `beta` et un `growth`.
 * Un espace Growth voit donc son prix BAISSER de 249 € à 199 € au prochain
 * cycle, sans rien perdre : le quota (250) et les sièges (1) sont déjà les
 * siens. Il n'y a rien à réécrire côté `subscriptions`.
 *
 * Ce que cette migration NE fait pas, et pourquoi :
 *  · elle ne touche pas `accounts_used` — une consommation réelle est une
 *    trace comptable, jamais un compteur qu'on ajuste ;
 *  · elle ne touche pas `extra_seats` — les sièges déjà achetés ont été payés.
 *    Growth n'en vend plus, mais celui qui en a gardé garde ce qu'il a pris ;
 *  · elle ne touche ni `beta`, ni `trial`, ni `decouverte` — leurs quotas sont
 *    posés à la main et n'ont jamais suivi la grille publique.
 */
export class PricingGridAugust271790283462817 implements MigrationInterface {
  public name = 'PricingGridAugust271790283462817'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Le catalogue éditable par l'opérateur ------------------------------
    // Growth devient LE palier : 199 €, et `extra_seat_price_cents = 0` dit
    // qu'aucun siège ne s'y achète. Zéro n'est PAS « siège gratuit » : les
    // écrans qui lisent ce champ doivent se taire à zéro plutôt qu'annoncer
    // « +0 € / siège », ce qui inviterait à un achat qui n'existe pas.
    await queryRunner.query(`
      UPDATE plan_definitions
         SET label = 'Growth',
             price_cents = 19900,
             accounts_limit = 250,
             seats = 1,
             extra_seat_price_cents = 0,
             self_serve = true
       WHERE key = 'growth'
    `)

    // Starter quitte la grille publique. Prix et quota INCHANGÉS : ce sont ceux
    // que payent les espaces qui l'ont souscrit.
    await queryRunner.query(`
      UPDATE plan_definitions
         SET self_serve = false
       WHERE key = 'starter'
    `)

    // Le palier sur devis s'appelle « Entreprise » — plus « Team / Enterprise ».
    // Le CODE reste `team` : renommer une clé casserait les lignes qui la
    // portent, et un libellé commercial n'a pas à voyager jusqu'à la base.
    await queryRunner.query(`
      UPDATE plan_definitions
         SET label = 'Entreprise',
             self_serve = false
       WHERE key = 'team'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Retour exact à la grille du 16/08 (migration 1789400000001).
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
    await queryRunner.query(`
      UPDATE plan_definitions
         SET self_serve = true
       WHERE key = 'starter'
    `)
    await queryRunner.query(`
      UPDATE plan_definitions
         SET label = 'Team / Enterprise',
             self_serve = false
       WHERE key = 'team'
    `)
  }
}
