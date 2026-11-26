import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2260.17 (LAU-FINAL-005) — UNE HUITIÈME NATURE, `goal`, ET LA CONTRAINTE D'ABORD.
 *
 * Le centre « ce que Laura garde en tête » doit distinguer un OBJECTIF (« ouvrir
 * 3 comptes Banque ce trimestre ») d'une préférence ou d'un fait déclaré —
 * aucune des sept natures existantes ne le portait. Sans cette migration,
 * épingler un objectif serait refusé par Postgres après le clic (GA-11 / GA-12 :
 * la contrainte s'élargit AVANT le code qui écrit).
 *
 * Porte « ajout seulement » : la contrainte s'ÉLARGIT, elle ne rétrécit pas.
 * Les sept valeurs d'origine restent en tête et à leur rang (GA-08). Aucune
 * ligne n'est réécrite — aucun fait ne change de nature en silence.
 *
 * `DROP ... IF EXISTS` d'abord, sinon l'ancienne contrainte resterait en place
 * À CÔTÉ de la neuve et continuerait de refuser `goal` — la migration serait
 * verte et ne servirait à rien (même méthode que `1794001962000`).
 *
 * ⚠️ La liste est ÉCRITE ICI, pas importée du contrat : une migration décrit
 * l'état de la base à SA date. Le test confronte les deux.
 */
export class MemoryItemKindGoalAdded1795540000000 implements MigrationInterface {
  public name = 'MemoryItemKindGoalAdded1795540000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE memory_pinned_facts DROP CONSTRAINT IF EXISTS memory_pinned_facts_kind_check`)
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        ADD CONSTRAINT memory_pinned_facts_kind_check
        CHECK (kind IN ('fact', 'preference', 'correction', 'workspace_rule', 'sourced_observation', 'hypothesis', 'temporary_context', 'goal'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
