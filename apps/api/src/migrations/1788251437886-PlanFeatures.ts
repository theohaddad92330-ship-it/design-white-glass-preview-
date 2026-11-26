import { MigrationInterface, QueryRunner } from 'typeorm'
import { PLAN_CATALOG_DEFAULTS, PLAN_KEYS } from '../modules/credits/plan-catalog.defaults'

/**
 * `plan_definitions.features` — la grille de gating PAR OFFRE, éditable comme le
 * reste du catalogue (prix, quotas, sièges).
 *
 * Jusqu'ici un palier ne différenciait que du chiffre ; les puces des cartes
 * (« Chat IA, historique & exports PDF/CSV ») étaient du texte marketing que
 * rien n'appliquait. Cette colonne dit ce qu'un palier OUVRE, et l'API refuse le
 * reste.
 *
 * ⚠️ CETTE MIGRATION FERME DES PORTES (grille validée par Louis le 26/07) :
 * Starter-Solo garde les exports, Team ajoute le copilote, Growth ajoute les
 * branchements (CRM, MCP, API publique). Un abonné Starter-Solo qui utilisait le
 * copilote hier ne l'a plus après ce déploiement — c'est l'arbitrage commercial
 * demandé, pas un effet de bord. Les paliers non vendus (essai, beta,
 * découverte) reçoivent TOUT : ils servent à montrer le produit.
 *
 * Le seed vient de {@link PLAN_CATALOG_DEFAULTS} plutôt que d'une liste recopiée
 * ici : la grille du code et celle de la base ne peuvent donc pas diverger, et
 * `plan-catalog-features.spec.ts` vérifie l'égalité des deux.
 *
 * Il ne s'applique que si AUCUN palier n'a encore de grille (`NOT EXISTS (…
 * features <> '[]')`). Rejouée après qu'un opérateur a posé la sienne depuis le
 * backoffice, la migration ne fait rien — y compris quand il a délibérément tout
 * fermé sur un palier : ce `[]`-là est une décision, pas un vide à remplir.
 */
export class PlanFeatures1788251437886 implements MigrationInterface {
  public name = 'PlanFeatures1788251437886'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE plan_definitions
        ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb
    `)
    // Un seul verrou, évalué AVANT la première écriture : sans lui, la ligne 1
    // remplie ferait échouer la condition pour les suivantes et seul le premier
    // palier serait seedé.
    const [{ virgin }] = (await queryRunner.query(
      `SELECT NOT EXISTS (
         SELECT 1 FROM plan_definitions WHERE features IS NOT NULL AND features <> '[]'::jsonb
       ) AS virgin`,
    )) as [{ virgin: boolean }]
    if (!virgin) return

    for (const key of PLAN_KEYS) {
      await queryRunner.query(`UPDATE plan_definitions SET features = $1::jsonb, updated_at = NOW() WHERE key = $2`, [
        JSON.stringify(PLAN_CATALOG_DEFAULTS[key].features),
        key,
      ])
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
