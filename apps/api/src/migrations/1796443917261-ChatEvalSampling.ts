import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2899 / #2443.10 / #2278.9 (lot W5, décision Louis 11/10/2026) — L'ÉCHANTILLONNAGE DE
 * CONVERSATIONS DE LAURA POUR LES ÉVALS, OPT-IN PAR ESPACE.
 *
 * Deux ajouts, aucune réécriture :
 *
 *  · `workspaces.chat_eval_sampling_enabled boolean NOT NULL DEFAULT false` — le réglage, à
 *    UN seul endroit (GA-26), ÉTEINT par défaut : aucun espace existant n'est échantillonné
 *    tant que son propriétaire n'a pas coché.
 *  · `chat_eval_samples` — le tour ANONYMISÉ (le texte est masqué AVANT l'écriture,
 *    `chat-eval-anonymizer.ts`), jamais le corps d'un message rédigé. Aucune politique RLS :
 *    table de service, jamais lue par un navigateur. `ON DELETE CASCADE` sur l'espace : fermer
 *    l'espace efface ses échantillons, et décocher le réglage aussi (le service purge).
 *
 * Posées avant tout code qui écrit (GA-11/GA-12).
 */
export class ChatEvalSampling1796443917261 implements MigrationInterface {
  name = 'ChatEvalSampling1796443917261'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS chat_eval_sampling_enabled boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_eval_samples (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        anonymized_text text NOT NULL,
        sampled_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chat_eval_samples_text_length_check CHECK (char_length(anonymized_text) BETWEEN 1 AND 500)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS chat_eval_samples_workspace_idx ON chat_eval_samples (workspace_id, sampled_at DESC)`,
    )
    await queryRunner.query(`ALTER TABLE chat_eval_samples ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chat_eval_samples`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS chat_eval_sampling_enabled`)
  }
}
