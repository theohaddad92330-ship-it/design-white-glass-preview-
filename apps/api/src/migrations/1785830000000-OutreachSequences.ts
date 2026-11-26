import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Séquences d'outreach multi-touch (roadmap §8 « programme une relance/séquence »).
 *
 * `outreach_sequences` = une cadence de relances datées sur un contact
 * (active → paused/completed/cancelled). `outreach_sequence_steps` = les touches
 * datées (`due_at`) : `email` (draft préparé + rappel « à envoyer » — JAMAIS
 * d'envoi automatique), `reminder`/`task` (rappels internes datés, journalisés
 * dans `user_actions` via l'Action Router). Le `payload` jsonb porte le contexte
 * (label, note, snapshot du brouillon email préparé).
 *
 * FK contact ON DELETE CASCADE : la suppression RGPD d'un contact emporte ses
 * séquences. `workspace_id` sans FK, comme `user_actions` (scope de lecture).
 */
export class OutreachSequences1785830000000 implements MigrationInterface {
  public name = 'OutreachSequences1785830000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_sequences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id uuid NOT NULL,
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_outreach_sequences_workspace ON outreach_sequences (workspace_id)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_outreach_sequences_user ON outreach_sequences (user_id)`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_outreach_sequences_contact ON outreach_sequences (contact_id)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_sequence_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sequence_id uuid NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
        position integer NOT NULL,
        due_at timestamptz NOT NULL,
        kind text NOT NULL CHECK (kind IN ('email', 'reminder', 'task')),
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
        done_at timestamptz
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_outreach_sequence_steps_sequence ON outreach_sequence_steps (sequence_id)`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
