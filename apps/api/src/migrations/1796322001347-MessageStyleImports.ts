import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2369.2/.3 (épopée #2768, LAU-FINAL-084) — l'import pour apprentissage :
 * sa nature (sept valeurs de `MESSAGE_STYLE_IMPORT_KINDS`, #2369.3) et sa
 * source admise (quinze valeurs de `MESSAGE_STYLE_SOURCE_TYPES`, #2369.2).
 * Les deux contraintes CHECK ci-dessous sont la copie EXACTE des deux
 * énumérations (`@bellum/contracts`), posées AVANT le code qui les écrit
 * (GA-11/GA-12).
 *
 * `raw_text` est le corps importé — stocké ici (journal), jamais renvoyé par
 * l'API (doctrine, voir `message-style-import.entity.ts`).
 *
 * Porte `workspace_id` (nullable, même convention que
 * `message_style_templates`) + `user_id` : scopée au sens de
 * `table-scopes.ts`, rien à déclarer (portée dérivée de la colonne).
 */
export class MessageStyleImports1796322001347 implements MigrationInterface {
  name = 'MessageStyleImports1796322001347'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_style_imports (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id      uuid NOT NULL,
        import_kind  text NOT NULL,
        source_type  text NOT NULL,
        raw_text     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_style_imports_import_kind_check CHECK (import_kind IN (
          'linkedin_message', 'email', 'phone_pitch', 'follow_up',
          'introduction', 'partner_message', 'profile_push')),
        CONSTRAINT message_style_imports_source_type_check CHECK (source_type IN (
          'validated_example', 'imported_template', 'sent_message', 'accepted_edit',
          'brand_guide', 'signature', 'user_preference', 'formality', 'language',
          'forbidden_words', 'allowed_cta', 'length', 'punctuation',
          'opening_formula', 'closing_formula'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_message_style_imports_workspace ON message_style_imports (workspace_id)`,
    )
    await queryRunner.query(`ALTER TABLE message_style_imports ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS message_style_imports`)
  }
}
