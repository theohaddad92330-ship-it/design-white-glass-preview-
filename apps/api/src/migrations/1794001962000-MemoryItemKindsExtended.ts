import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1962.2/.5/.7/.9/.10 — QUATRE NATURES DE PLUS, ET LA CONTRAINTE D'ABORD.
 *
 * `memory_pinned_facts.kind` n'acceptait que `fact` / `preference` /
 * `correction`. Le contrat en nomme désormais sept : une règle d'ESN, une
 * observation sourcée, une hypothèse à vérifier, un contexte temporaire. Sans
 * cette migration, l'épinglage de l'une d'elles serait refusé par Postgres —
 * après le clic, au dernier mètre (GA-11 / GA-12 : la contrainte s'élargit
 * AVANT le code qui écrit).
 *
 * Porte « ajout seulement » : la contrainte s'ÉLARGIT, elle ne rétrécit pas.
 * Les trois valeurs d'origine restent en tête et à leur rang (GA-08), donc
 * chaque ligne déjà écrite garde exactement le sens qu'elle avait. Aucune ligne
 * n'est réécrite — aucun fait ne change de nature en silence.
 *
 * Postgres n'a pas d'`ALTER CONSTRAINT` pour un CHECK : on retire puis on
 * repose. `DROP ... IF EXISTS` d'abord, sinon l'ancienne contrainte resterait en
 * place À CÔTÉ de la neuve et continuerait de refuser les quatre valeurs — la
 * migration serait verte et ne servirait à rien.
 *
 * ⚠️ La liste est ÉCRITE ICI, pas importée du contrat : une migration décrit
 * l'état de la base à SA date. Importer l'enum ferait changer le SQL déjà joué
 * le jour où une huitième nature arriverait. Le test, lui, confronte les deux.
 */
export class MemoryItemKindsExtended1794001962000 implements MigrationInterface {
  public name = 'MemoryItemKindsExtended1794001962000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE memory_pinned_facts DROP CONSTRAINT IF EXISTS memory_pinned_facts_kind_check`)
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        ADD CONSTRAINT memory_pinned_facts_kind_check
        CHECK (kind IN ('fact', 'preference', 'correction', 'workspace_rule', 'sourced_observation', 'hypothesis', 'temporary_context'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
