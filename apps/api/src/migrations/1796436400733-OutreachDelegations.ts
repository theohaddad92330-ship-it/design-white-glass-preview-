import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3702.9 — le MANDAT d'envoi délégué (c89, 05/10/2026) : explicite, borné
 * (durée, volume, contacts), révocable. Une table neuve, rien n'est migré :
 * aucun mandat rétroactif sur les campagnes existantes (#3702.11).
 * `messages` = version relue par message ; `content_hash` en est l'empreinte.
 */
export class OutreachDelegations1796436400733 implements MigrationInterface {
  name = 'OutreachDelegations1796436400733'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_delegations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        campaign_label text NOT NULL,
        contact_ids jsonb NOT NULL,
        channels jsonb NOT NULL,
        sender_mailbox_id text NOT NULL,
        messages jsonb NOT NULL,
        content_hash text NOT NULL,
        window_start_hour integer NOT NULL,
        window_end_hour integer NOT NULL,
        starts_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        max_messages integer NOT NULL,
        sent_count integer NOT NULL DEFAULT 0,
        validated_by jsonb NOT NULL,
        validated_at timestamptz NOT NULL,
        revoked_at timestamptz,
        paused_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outreach_delegations_window_check CHECK (window_start_hour >= 0 AND window_end_hour <= 24 AND window_start_hour < window_end_hour),
        CONSTRAINT outreach_delegations_quota_check CHECK (max_messages >= 1 AND sent_count >= 0)
      );
      CREATE INDEX IF NOT EXISTS idx_outreach_delegations_workspace ON outreach_delegations (workspace_id);
      ALTER TABLE outreach_delegations ENABLE ROW LEVEL SECURITY;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outreach_delegations;`)
  }
}
