import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2153.57 — le RÉSULTAT d'une action canonique devient une colonne de
 * `action_plan_items`.
 *
 * Distinct de `expected_outcome`/`kpi` (`1795380046123-PlanActionOutcomeAndKpi`)
 * qui portent l'ATTENDU, écrit AVANT le geste : confondre les deux ferait
 * relire un objectif comme un fait constaté. Purement DÉCLARATIF, comme
 * « Fait » lui-même — jamais une preuve d'exécution vérifiée par Bellum
 * (`c73_fait_ne_porte_pas_preuve_denvoi`, `agent_docs/doctrine.md:41`).
 *
 * En AJOUT SEULEMENT, nullable et sans défaut : `NULL` veut dire « rien de
 * saisi », ce qui n'est pas une chaîne vide. Posée AVANT le code qui l'écrit
 * (GA-11 / GA-12).
 */
export class PlanActionResult1795999457405 implements MigrationInterface {
  public name = 'PlanActionResult1795999457405'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS result text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
