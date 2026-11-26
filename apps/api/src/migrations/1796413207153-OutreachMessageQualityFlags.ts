import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `outreach_message_quality_flags` — #2877 (#2385.4, lot P06 30/09/2026).
 *
 * Les signaux QUALITÉ d'un message (faux fait, CTA incorrect, persona
 * incorrect) sont DÉCLARÉS par le commercial qui relit : distinguer un faux
 * fait suppose de lire le corps du message, que la doctrine interdit d'exposer
 * à une classification. La source est un geste humain ; cette table le garde.
 *
 * Une déclaration par (message, nature, auteur) : re-déclarer est sans effet
 * (idempotent). On archive, on ne supprime pas ; le message supprimé emporte
 * ses déclarations (CASCADE).
 */
export class OutreachMessageQualityFlags1796413207153 implements MigrationInterface {
  public name = 'OutreachMessageQualityFlags1796413207153'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_message_quality_flags (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        message_id uuid NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
        flagged_by uuid NOT NULL,
        kind text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outreach_message_quality_flags_unique UNIQUE (message_id, kind, flagged_by),
        CONSTRAINT outreach_message_quality_flags_kind_check CHECK (kind IN ('wrong_fact', 'wrong_cta', 'wrong_persona'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outreach_message_quality_flags_workspace
        ON outreach_message_quality_flags (workspace_id, kind)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
