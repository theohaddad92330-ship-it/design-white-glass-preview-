import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3236.2 (b, tranche) — la trace persistante d'un approfondissement interrompu.
 *
 * Avant cette table, le seul point de reprise d'un tour Approfondi coupé vivait
 * dans `conversation_summaries.thread_state` (`current_job`/`next_step`),
 * borné à 17 Ko par le schéma zod (voir `conversation-thread-state.ts`) — un
 * ÉTAT relayé à chaque tour, jamais un enregistrement qu'un écran peut relire
 * après un rechargement de page sans rejouer la conversation. Cette table est
 * ce second enregistrement : une ligne par approfondissement, mise à jour en
 * place par la MÊME personne et conversation, jamais fondue dans le fil.
 *
 * Statuts : `queued` (coupure signalée par l'IA, pas encore reprise),
 * `running` (réservé à une future tranche : la reprise active), `done`
 * (réservé de même — rien dans ce lot ne l'écrit), `unknown` (le balayage
 * `ChatDeepenJobsReaper` l'y place après un délai sans nouvelle signalisation
 * — JAMAIS `failed` : un timeout n'est pas un échec, doctrine CLAUDE.md).
 */
export class ChatDeepenJobs1796437700001 implements MigrationInterface {
  public name = 'ChatDeepenJobs1796437700001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_deepen_jobs (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        conversation_id text NOT NULL,
        label text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        completed_steps integer NOT NULL DEFAULT 0,
        current_step text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chat_deepen_jobs_status_check CHECK (status IN ('queued', 'running', 'done', 'unknown'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_deepen_jobs_user_conversation_idx
      ON chat_deepen_jobs (user_id, conversation_id, updated_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
