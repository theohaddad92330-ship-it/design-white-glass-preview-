import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3427 — LA BIBLIOTHÈQUE VERSIONNÉE D'EXEMPLES COMMERCIAUX.
 *
 * Les contraintes CHECK ci-dessous sont la copie exacte des enums de
 * `@bellum/contracts/schemas/message-library.ts`, posée AVANT le code qui
 * l'écrit (GA-11/GA-12). `scenario_id`/`channel`/`persona` reprennent
 * exactement le vocabulaire du registre partagé `outreach-scenarios.ts`
 * (GA-26) — jamais un second jeu de valeurs.
 *
 * Scopée par `workspace_id` (comme `message_style_templates`) : chaque
 * espace construit SA bibliothèque approuvée, jamais une bibliothèque
 * globale entre concurrents (GA-43).
 */
export class MessageLibraryEntries1796409491877 implements MigrationInterface {
  name = 'MessageLibraryEntries1796409491877'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_library_entries (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id       uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        created_by         uuid,
        title              text NOT NULL,
        body               text NOT NULL,
        origin             text NOT NULL,
        source_document    text NOT NULL,
        version            integer NOT NULL DEFAULT 1,
        entry_date         timestamptz NOT NULL,
        channel            text NOT NULL,
        scenario_id        text NOT NULL,
        persona            text NOT NULL,
        decision_role      text NOT NULL,
        stage              text NOT NULL,
        route              text NOT NULL,
        objective          text NOT NULL,
        expected_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
        mandatory_facts    jsonb NOT NULL DEFAULT '[]'::jsonb,
        claims             jsonb NOT NULL DEFAULT '[]'::jsonb,
        status             text NOT NULL DEFAULT 'a_revoir',
        mode               text NOT NULL,
        usage_constraints  jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_library_entries_version_positive CHECK (version > 0),
        CONSTRAINT message_library_entries_channel_check
          CHECK (channel IN ('linkedin_draft', 'email_draft', 'call_brief')),
        CONSTRAINT message_library_entries_scenario_check CHECK (scenario_id IN (
          'accepted_connection', 'dormant_connection', 'referred_contact', 'cold_approach')),
        CONSTRAINT message_library_entries_persona_check CHECK (persona IN (
          'decideur', 'gouvernance', 'direction', 'manager', 'acheteur', 'expert', 'operationnel')),
        CONSTRAINT message_library_entries_status_check
          CHECK (status IN ('approuve', 'a_revoir', 'historique', 'interdit')),
        CONSTRAINT message_library_entries_mode_check CHECK (mode IN ('verbatim', 'inspiration'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_message_library_entries_selection
        ON message_library_entries (workspace_id, channel, scenario_id, persona, mode, status)
    `)

    await queryRunner.query(`ALTER TABLE message_library_entries ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "message_library_entries_member_read" ON message_library_entries`)
    await queryRunner.query(`
      CREATE POLICY "message_library_entries_member_read" ON message_library_entries FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS message_library_entries`)
  }
}
