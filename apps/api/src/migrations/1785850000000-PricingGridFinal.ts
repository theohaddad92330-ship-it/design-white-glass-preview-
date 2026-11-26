import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Grille pricing finale — la grille RECOMMANDÉE du proposal, validée
 * (agent_docs/billing/pricing-proposal.md §3, VALIDÉ Louis 16/07) :
 * Starter-Solo 119€ (15/20, 1 siège) · Team 259€ (50/100, 3 sièges) ·
 * Growth 599€ (120/300, 8 sièges) · Beta 59€ inchangé · Enterprise sur devis.
 *
 * Migration-safe, même pattern que 1785000000000 (scale→business) :
 *
 * - Renomme les codes plan : `pro` → `team`, `business` → `growth`. Les lignes
 *   existantes GARDENT leurs accounts_limit / enrichment_credits stockés — les
 *   nouveaux quotas Team/Growth sont PLUS HAUTS (50/100 et 120/300) et
 *   s'appliquent au prochain checkout / subscription.updated ; le reset mensuel
 *   remonte déjà les enrichissements au quota du plan via GREATEST.
 * - Starter passe de 3 sièges inclus à 1 (Starter-Solo). Les abonnés starter
 *   ACTIFS (stripe_subscription_id non nul) sont grand-fathered à leurs 3
 *   sièges promis via +2 `extra_seats` (gratuits — aucune ligne Stripe créée),
 *   pour qu'aucune équipe existante ne perde de sièges en cours d'abonnement.
 * - Le trigger de signup (trial 40/75) est inchangé : le proposal ne redéfinit
 *   pas l'essai (question §4.3 laissée ouverte → statu quo).
 */
export class PricingGridFinal1785850000000 implements MigrationInterface {
  public name = 'PricingGridFinal1785850000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Rename pro → team, preserving each customer's stored quotas.
    await queryRunner.query(`UPDATE subscriptions SET plan = 'team' WHERE plan = 'pro'`)

    // 2) Rename business → growth, preserving stored quotas.
    await queryRunner.query(`UPDATE subscriptions SET plan = 'growth' WHERE plan = 'business'`)

    // 3) Grandfather active starter subscribers at their promised 3 seats
    //    (starter now includes 1): +2 free extra seats, once.
    await queryRunner.query(`
      UPDATE subscriptions
      SET extra_seats = extra_seats + 2
      WHERE plan = 'starter' AND stripe_subscription_id IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
