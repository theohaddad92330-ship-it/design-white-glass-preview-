import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les salles de démonstration montrent le palier VENDU, pas un palier gratuit.
 *
 * Recette live du 02/09/2026, après la fermeture de l'essai gratuit. L'écran
 * Facturation d'une salle de démo annonçait, à un prospect :
 *
 *   « Bellum Découverte » · badge « Essai » · « 1 crédits / mois »
 *   « Essai — expire le 19 août 2026 »  ← une date PASSÉE
 *   et, dans les fonctions, « 0 crédits/mois » — l'autre chiffre de la carte.
 *
 * Deux fautes superposées :
 *
 *  · la ligne d'abonnement des salles portait `decouverte` avec 1 crédit — la
 *    valeur d'AVANT la pondération du 02/08 (une analyse coûte 8 crédits depuis,
 *    donc « 1 crédit » ne permettait déjà plus rien) ;
 *  · `DemoPoolService.mirrorEntitlement` RECOPIE la ligne de la salle ancre sur
 *    chaque nouvelle salle. Une ancre fausse se propageait donc à toutes, et
 *    corriger le repli en TypeScript (fait dans le même chantier) ne rattrapait
 *    que les salles encore à créer.
 *
 * On aligne donc les lignes existantes. Une salle de démo n'est le compte de
 * personne : son « abonnement » est un AFFICHAGE (un espace `is_demo` ne débite
 * jamais, `CreditsService` court-circuite avant toute écriture). Le mettre sur
 * le palier vendu est ce qui décrit honnêtement ce qu'on montre.
 *
 * Le quota n'est PAS écrit en dur : il se lit dans `plan_definitions`, le
 * catalogue vivant. Un repricing fait au back-office atteint donc les démos
 * aussi, sans redéploiement.
 */
export class DemoRoomsOnSoldPlan1791594612903 implements MigrationInterface {
  public name = 'DemoRoomsOnSoldPlan1791594612903'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE subscriptions
         SET plan = 'growth',
             accounts_limit = COALESCE((SELECT accounts_limit FROM plan_definitions WHERE key = 'growth'), 250),
             accounts_used = 0,
             enrichment_credits = 0,
             topup_analyses = 0,
             trial_end = NULL
       WHERE user_id IN (SELECT owner_user_id FROM workspaces WHERE is_demo = true)
         -- Un utilisateur qui possède AUSSI un espace réel n'est pas une salle
         -- de démonstration : c'est quelqu'un. On ne réécrit jamais sa
         -- facturation, même si une salle lui a été attachée par accident.
         AND user_id NOT IN (SELECT owner_user_id FROM workspaces WHERE is_demo = false)
         -- Ceinture et bretelles : jamais une ligne rattachée à Stripe.
         AND stripe_subscription_id IS NULL
         AND stripe_customer_id IS NULL
         -- Et seulement depuis un palier GRATUIT : une salle déjà alignée, ou
         -- posée à la main sur autre chose, n'est pas touchée.
         AND plan IN ('trial', 'decouverte')
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
