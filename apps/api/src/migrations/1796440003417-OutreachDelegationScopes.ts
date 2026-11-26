import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4016 L5 — DÉCISION LOUIS 11/10/2026 : l'envoi automatique, TOUJOURS derrière
 * un mandat signé. Le mandat c89 (`outreach_delegations`) gagne une PORTÉE —
 * campagne (l'existant), séquences de l'espace, Laura, relance d'impayé, suivi
 * de rendez-vous — et un message gagne la portée sous laquelle il ATTEND un
 * mandat (`outreach_messages.mandate_scope`).
 *
 * La contrainte SQL est élargie AVANT le code qui écrit ces valeurs (GA-11 /
 * GA-12). Rien n'est rétroactif : les mandats existants deviennent `campaign`
 * (ce qu'ils étaient), aucun message existant ne reçoit de portée.
 * `content_hash` devient NULLABLE : une portée d'espace fige le contenu message
 * par message, pas par empreinte globale.
 */
export class OutreachDelegationScopes1796440003417 implements MigrationInterface {
  name = 'OutreachDelegationScopes1796440003417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_delegations ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'campaign';
      ALTER TABLE outreach_delegations DROP CONSTRAINT IF EXISTS outreach_delegations_scope_check;
      ALTER TABLE outreach_delegations ADD CONSTRAINT outreach_delegations_scope_check
        CHECK (scope IN ('campaign', 'workspace_sequences', 'laura_send', 'payment_reminder', 'meeting_follow_up'));
      ALTER TABLE outreach_delegations ADD COLUMN IF NOT EXISTS renewed_from uuid NULL;
      ALTER TABLE outreach_delegations ALTER COLUMN content_hash DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_outreach_delegations_workspace_scope ON outreach_delegations (workspace_id, scope);

      ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS mandate_scope text NULL;
      ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS mandate_originated_at timestamptz NULL;
      ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_mandate_scope_check;
      ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_mandate_scope_check
        CHECK (mandate_scope IS NULL OR mandate_scope IN ('campaign', 'workspace_sequences', 'laura_send', 'payment_reminder', 'meeting_follow_up'));
      CREATE INDEX IF NOT EXISTS idx_outreach_messages_mandate_scope
        ON outreach_messages (status, mandate_scope) WHERE mandate_scope IS NOT NULL;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_outreach_messages_mandate_scope;
      ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_mandate_scope_check;
      ALTER TABLE outreach_messages DROP COLUMN IF EXISTS mandate_originated_at;
      ALTER TABLE outreach_messages DROP COLUMN IF EXISTS mandate_scope;
      DROP INDEX IF EXISTS idx_outreach_delegations_workspace_scope;
      ALTER TABLE outreach_delegations DROP COLUMN IF EXISTS renewed_from;
      ALTER TABLE outreach_delegations DROP CONSTRAINT IF EXISTS outreach_delegations_scope_check;
      ALTER TABLE outreach_delegations DROP COLUMN IF EXISTS scope;
    `)
  }
}
