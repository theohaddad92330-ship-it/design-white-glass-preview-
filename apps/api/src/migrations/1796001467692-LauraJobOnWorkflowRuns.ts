import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2276 — le job composite de Laura devient une ligne `workflow_runs`
 * (`trigger = definition_key = 'laura_job'`, `packages/contracts/src/schemas/laura-job.ts`).
 *
 * ADDITIVE seulement : une colonne NULLABLE, rien de rempli, rien de retiré. Une
 * ligne existante (carte, workflow) lit `job = null` — ce n'est pas un job.
 *
 * `job` porte la FICHE (`LauraJobBrief`) : demande originale, intention, résultat
 * attendu, scope, hypothèses, étapes et dépendances, sources, durée prévue,
 * résultats intermédiaires, erreurs, objets créés. Le reste d'un job vit déjà sur
 * la ligne (owner, conversation, coûts, dates, statut, idempotence).
 *
 * Aucune contrainte à élargir (GA-11 / GA-12) : `status` et `trigger` sont des
 * `text NOT NULL` sans CHECK depuis `1788270000000-ActionOs.ts` — vérifié aussi
 * par `1792800020000-CopilotCardsOnWorkflowRuns.ts` — donc `draft`, `to_confirm`
 * et `laura_job` s'écrivent sans migration de contrainte.
 */
export class LauraJobOnWorkflowRuns1796001467692 implements MigrationInterface {
  public name = 'LauraJobOnWorkflowRuns1796001467692'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS job jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workflow_runs DROP COLUMN IF EXISTS job`)
  }
}
