import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2369.9/.10 (épopée #2768, LAU-FINAL-084) — l'objet Template de la mémoire
 * de style : objectif, canal (même vocabulaire qu'`outreach_messages`,
 * GA-26), persona, statut (cycle à cinq de
 * `checkMessageStyleTemplateTransition`), interdits, version, owner. La
 * contrainte CHECK ci-dessous est la copie exacte de
 * `MESSAGE_STYLE_TEMPLATE_STATUSES` (`@bellum/contracts`), posée AVANT le code
 * qui l'écrit (GA-11/GA-12).
 *
 * Porte `workspace_id` (nullable, même convention que `outreach_messages`/
 * `library_items`) + `user_id` : scopée au sens de `table-scopes.ts`, rien à
 * déclarer (portée dérivée de la colonne).
 */
export class MessageStyleTemplates1796321264605 implements MigrationInterface {
  name = 'MessageStyleTemplates1796321264605'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_style_templates (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id      uuid NOT NULL,
        objective    text NOT NULL,
        channel      text NOT NULL,
        persona      text NOT NULL,
        status       text NOT NULL DEFAULT 'draft',
        forbidden    jsonb NOT NULL DEFAULT '[]'::jsonb,
        version      integer NOT NULL DEFAULT 1,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_style_templates_channel_check CHECK (channel IN ('email', 'linkedin', 'phone', 'manual')),
        CONSTRAINT message_style_templates_status_check CHECK (status IN (
          'draft', 'validated', 'active', 'deprecated', 'archived')),
        CONSTRAINT message_style_templates_version_positive CHECK (version > 0)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_message_style_templates_workspace_status ON message_style_templates (workspace_id, status)`,
    )
    await queryRunner.query(`ALTER TABLE message_style_templates ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS message_style_templates`)
  }
}
