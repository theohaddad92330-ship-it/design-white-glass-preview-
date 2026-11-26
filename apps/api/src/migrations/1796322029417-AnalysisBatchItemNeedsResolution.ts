import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2283.32 (épopée #2983) — « Entity Resolver ambigu → demander une résolution
 * ou exclure du lot. »
 *
 * Élargit le CHECK de `analysis_batch_items.state` à `needs_resolution` : un
 * sous-job dont l'analyse a ABOUTI mais dont le Résolveur d'identité (#2284,
 * `raw_analysis.entity_resolution.state === 'ambiguous'`) reste ambigu malgré
 * un SIREN unique au départ (homonyme de taille/secteur incompatible, trouvé
 * PENDANT l'analyse — distinct de `to_confirm`, une ambiguïté de NOM connue
 * AVANT tout lancement). Posée AVANT le code qui l'écrit (GA-11/GA-12) —
 * `AnalysisBatchesService.refresh` (prochain commit) sinon rejetée par
 * Postgres à chaque lecture d'un lot touché.
 *
 * Additif + idempotent (drop-then-add), aucune valeur retirée (GA-08), valeur
 * ajoutée en FIN de liste — même forme que `CrmTaskCreatedActionType`.
 */
export class AnalysisBatchItemNeedsResolution1796322029417 implements MigrationInterface {
  name = 'AnalysisBatchItemNeedsResolution1796322029417'

  // #2283.32 — les valeurs s'écrivent EN CLAIR (jamais interpolées) : GA-12
  // (`check-constraints-cover-enums.spec.ts`) lit la DÉCLARATION SQL du
  // fichier de migration, pas une liste construite à l'exécution — un
  // `IN (${list})` interpolé ne lui rend AUCUNE valeur littérale, et la
  // garde retomberait sur la liste à huit de `1796000544454-AnalysisBatches`.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE analysis_batch_items DROP CONSTRAINT IF EXISTS analysis_batch_items_state_check`,
    )
    await queryRunner.query(`
      ALTER TABLE analysis_batch_items ADD CONSTRAINT analysis_batch_items_state_check
        CHECK (state IN ('resolved', 'to_confirm', 'queued', 'running', 'partial', 'done', 'failed', 'canceled', 'needs_resolution'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
