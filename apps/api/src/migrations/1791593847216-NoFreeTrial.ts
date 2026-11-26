import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Il n'y a plus d'essai gratuit — il y a la DÉMONSTRATION, et les licences.
 *
 * Arbitrage de Louis, 02/09/2026. Le produit tenait deux discours :
 *
 *  · l'écran d'onboarding annonce « plus d'entrée gratuite » depuis le 24/07
 *    (une fenêtre gratuite présentée à côté d'un abonnement poussait tout le
 *    monde vers la fenêtre) ;
 *  · le trigger `handle_new_user_credits` posait, lui, 48 crédits — six dossiers
 *    RÉELS, donc six séries d'appels fournisseurs payants — sur chaque compte
 *    créé en self-service, et un bouton permettait de monter à 120.
 *
 * C'est le discours silencieux qui gagnait. Cette migration aligne la base sur
 * l'écran.
 *
 * Ce qu'elle NE fait pas : supprimer les codes de palier `trial` et
 * `decouverte`. Un code de palier ne disparaît jamais (GA-08) — des lignes en
 * base les portent, et la résiliation d'un abonnement Stripe se rabat déjà sur
 * `trial`. Ils deviennent l'état VERROUILLÉ : nommables, à zéro crédit.
 *
 * ⚠️ IRRÉVERSIBLE sans sauvegarde (étape 3, décision explicite de Louis) : les
 * fenêtres gratuites encore ouvertes en production sont fermées au déploiement,
 * pas à leur échéance. Un compte en cours d'essai voit le mur à la prochaine
 * action et l'écran de choix de licence.
 */
export class NoFreeTrial1791593847216 implements MigrationInterface {
  public name = 'NoFreeTrial1791593847216'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Le catalogue éditable par l'opérateur. `UPDATE` et non `INSERT … DO
    //    NOTHING` : les deux lignes existent depuis 1786200000000 /
    //    1787943271504, et c'est justement leur quota qu'il faut corriger.
    //    Le backoffice reste libre de les remonter — ce serait un geste
    //    délibéré, tracé, pas un défaut embarqué.
    await queryRunner.query(
      `UPDATE plan_definitions SET accounts_limit = 0, enrichment_credits = 0, self_serve = false
       WHERE key IN ('trial', 'decouverte')`,
    )

    // 2. Le trigger de signup. Un compte créé en self-service reçoit désormais
    //    une ligne d'abonnement — la facturation a besoin d'un sujet, et
    //    l'écran doit pouvoir NOMMER un palier — mais à zéro crédit, et sans
    //    fenêtre à faire courir (`trial_end` immédiat : il n'y a rien à
    //    laisser expirer, l'état est verrouillé dès la première seconde).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user_credits()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      BEGIN
        INSERT INTO subscriptions (user_id, plan, accounts_limit, enrichment_credits, trial_end)
        VALUES (NEW.id, 'decouverte', 0, 0, now());
        RETURN NEW;
      END;
      $$
    `)

    // 3. Les fenêtres ENCORE OUVERTES en production.
    //
    //    Le quota des lignes n'est PAS remis à zéro : `accounts_used` raconte ce
    //    qui a réellement été consommé, et un plafond descendu sous l'usage
    //    afficherait « 8 / 0 ». C'est `trial_end` qui ferme — le même prédicat
    //    que le garde de consommation (`TRIAL_ACTIVE_SQL`), donc un seul endroit
    //    décide, et l'écran lit `trial_expired` comme il le fait déjà.
    //
    //    Les lignes DÉJÀ expirées ne sont pas touchées : leur date raconte quand
    //    leur fenêtre s'est fermée, et l'écraser réécrirait leur histoire.
    await queryRunner.query(
      `UPDATE subscriptions SET trial_end = now()
       WHERE plan IN ('trial', 'decouverte') AND (trial_end IS NULL OR trial_end > now())`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
