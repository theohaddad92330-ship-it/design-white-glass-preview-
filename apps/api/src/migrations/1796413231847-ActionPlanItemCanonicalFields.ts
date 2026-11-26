import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3287 (#3265.2, lot P09 30/09/2026) — les quatre champs manquants de l'ACTION
 * CANONIQUE : `source_recommendation` (quelle recommandation a produit
 * l'action), `method_rule` (la règle du corpus méthode), `external_execution_id`
 * (l'identifiant côté fournisseur quand le geste a été exécuté ailleurs) et
 * `stop_condition` (ce qui arrête CETTE action).
 *
 * Chacun a un écrivain réel (voir `ActionPlanItemsService.createManual` /
 * `.update`) et un lecteur (`PlanItemFacts`, agrégat de résultats par règle) :
 * pas une colonne morte. Texte libre, nullable, sans contrainte de valeurs —
 * `method_rule` est validée par le service contre `METHOD_CORPUS_V1`, pas par
 * un CHECK qui figerait le corpus en SQL. Additive seulement.
 */
export class ActionPlanItemCanonicalFields1796413231847 implements MigrationInterface {
  public name = 'ActionPlanItemCanonicalFields1796413231847'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE action_plan_items
        ADD COLUMN IF NOT EXISTS source_recommendation text,
        ADD COLUMN IF NOT EXISTS method_rule text,
        ADD COLUMN IF NOT EXISTS external_execution_id text,
        ADD COLUMN IF NOT EXISTS stop_condition text
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
