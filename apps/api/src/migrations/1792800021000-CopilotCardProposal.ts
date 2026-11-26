import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1931 L2 — une carte de copilote GARDE sa proposition.
 *
 * Additive, nullable, sans backfill : `workflow_runs.proposal` porte le
 * `PendingChatAction` que Laura a émis, tel quel. L1 a posé `intents` (ce qui
 * s'exécute) et `preview` (ce qu'un humain lit) ; aucune des deux ne permet de
 * reconstruire la proposition — or « Modifier » doit valider un patch contre la
 * BONNE forme de carte, et la vue d'une carte rend `action` (le contrat
 * `copilotCardViewSchema`). Sans elle, la carte ne se modifie pas et ne se relit
 * pas après rechargement.
 *
 * Aucune contrainte CHECK : la colonne est un `jsonb` libre, validé à l'écriture
 * par `pendingChatActionSchema` dans `CopilotCardService`. Toutes les lignes
 * existantes lisent `null`, ce que le service traite comme « pas une carte
 * modifiable » — jamais comme une erreur.
 */
export class CopilotCardProposal1792800021000 implements MigrationInterface {
  public name = 'CopilotCardProposal1792800021000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workflow_runs
        ADD COLUMN IF NOT EXISTS proposal jsonb
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
