import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * MONNAIE UNIQUE — un crédit vaut UNE action (décision produit Louis, 23/07).
 *
 * Le produit facturait DEUX monnaies : des « analyses » (quota du cycle,
 * `accounts_limit`/`accounts_used`) et des « enrichissements » (solde
 * décrémental, `enrichment_credits`). Un commercial pouvait donc se retrouver
 * avec des enrichissements mais plus d'analyses, devoir acheter deux packs
 * différents pour un seul geste métier, et lire deux compteurs pour savoir ce
 * qu'il pouvait faire.
 *
 * Désormais le pool du cycle (`accounts_limit` + `topup_analyses` − `accounts_used`)
 * est LA monnaie : analyses et enrichissements y puisent également.
 *
 * Conversion — PERSONNE NE PERD DE CAPACITÉ. Le solde d'enrichissements restant
 * de chaque ligne est ajouté au quota du cycle : un compte qui pouvait faire
 * « 5 analyses + 30 enrichissements » peut désormais faire 35 actions, au choix.
 * On ne retire donc rien à personne au moment de la bascule ; l'opérateur ajuste
 * ensuite les paliers dans le backoffice s'il le souhaite.
 *
 * La colonne `enrichment_credits` est CONSERVÉE (mise à 0) : la retirer casserait
 * les lectures encore en vol pendant le déploiement. L'API ne la lit plus pour
 * décider d'un débit — elle renvoie le solde unifié sous ce nom.
 *
 * Idempotente et rejouable : la conversion ne s'applique qu'aux lignes dont
 * `enrichment_credits > 0`, et les remet à 0 dans le même UPDATE.
 */
export class UnifiedCredits1787990000000 implements MigrationInterface {
  public name = 'UnifiedCredits1787990000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Les SOLDES : le restant d'enrichissements devient de la capacité de cycle.
    await queryRunner.query(`
      UPDATE subscriptions
      SET accounts_limit = accounts_limit + GREATEST(enrichment_credits, 0),
          enrichment_credits = 0
      WHERE COALESCE(enrichment_credits, 0) > 0
    `)

    // 2. Le CATALOGUE : chaque palier expose un seul quota. Même règle — la somme,
    //    pour qu'un client sur un palier donné garde au moins ce qu'il avait.
    await queryRunner.query(`
      UPDATE plan_definitions
      SET accounts_limit = accounts_limit + GREATEST(enrichment_credits, 0),
          enrichment_credits = 0
      WHERE COALESCE(enrichment_credits, 0) > 0
    `)
  }

  /**
   * Pas de `down` fidèle : la somme est irréversible (on ne sait pas rétablir la
   * répartition d'origine entre les deux monnaies). Rétablir un `enrichment_credits`
   * arbitraire inventerait des crédits — pire qu'un rollback impossible. On ne
   * touche donc à rien : le schéma est inchangé, seules des valeurs ont bougé.
   */
  public async down(): Promise<void> {
    // no-op — voir le commentaire ci-dessus.
  }
}
