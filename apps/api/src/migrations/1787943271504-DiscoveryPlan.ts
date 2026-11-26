import { MigrationInterface, QueryRunner } from 'typeorm'
import { PLAN_CATALOG_DEFAULTS } from '../modules/credits/plan-catalog.defaults'

/**
 * Palier « Découverte » — ce que reçoit un compte créé en self-service.
 *
 * Théo (21/07) : « il me faudrait un lien de démo ou genre la possibilité de se
 * créer un compte rapidos et d'avoir qu'une recherche possible — tout le monde me
 * demande d'avoir déjà accès au produit avant de pouvoir devenir bêta testeur
 * payant ». Le signup accordait jusqu'ici l'essai COMPLET (40 analyses, 75 crédits
 * d'enrichissement, 7 jours) : de quoi travailler un portefeuille entier sans
 * jamais payer.
 *
 * Désormais :
 *  - signup self-service → `decouverte` : UNE analyse réelle sur la cible du
 *    prospect + 5 crédits d'enrichissement (assez pour révéler les coordonnées des
 *    décideurs prioritaires — un dossier sans email ne démontre rien), 7 jours ;
 *  - `trial` (40/75, 7 jours) reste inchangé et devient un geste OPÉRATEUR,
 *    accordé depuis le backoffice à un vrai prospect bêta.
 *
 * Les lignes EXISTANTES ne sont pas touchées : personne ne se réveille bridé.
 * La fenêtre de 7 jours de `decouverte` est verrouillée par le même `trial_end`
 * que `trial` (cf. `WINDOWED_PLANS` dans `credits.service.ts`).
 */
export class DiscoveryPlan1787943271504 implements MigrationInterface {
  public name = 'DiscoveryPlan1787943271504'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const d = PLAN_CATALOG_DEFAULTS.decouverte
    // `DO NOTHING` : ré-exécutable, et n'écrase jamais un quota qu'un opérateur
    // aurait déjà ajusté dans le backoffice.
    await queryRunner.query(
      `INSERT INTO plan_definitions
         (key, label, price_cents, accounts_limit, enrichment_credits, seats, self_serve, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (key) DO NOTHING`,
      [d.key, d.label, d.price, d.accounts_limit, d.enrichment_credits, d.seats, d.self_serve, d.sort_order],
    )
    // La colonne est arrivée après la création de la table (migration 1786400000000) :
    // on la renseigne à part pour que l'ordre de déploiement n'ait pas d'importance.
    await queryRunner.query(
      `UPDATE plan_definitions SET extra_seat_price_cents = $1 WHERE key = $2 AND extra_seat_price_cents IS NULL`,
      [d.extra_seat_price, d.key],
    )

    // Trigger de signup : le compte démarre en Découverte, pas en essai complet.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user_credits()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      BEGIN
        INSERT INTO subscriptions (user_id, plan, accounts_limit, enrichment_credits, trial_end)
        VALUES (NEW.id, 'decouverte', ${PLAN_CATALOG_DEFAULTS.decouverte.accounts_limit}, ${PLAN_CATALOG_DEFAULTS.decouverte.enrichment_credits}, now() + interval '7 days');
        RETURN NEW;
      END;
      $$
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
