import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4737 (K2) — FUSION : le mandat d'envoi LinkedIn rejoint `outreach_delegations` (c89, #3702.9).
 *
 * Décision de Louis, 29/10/2026 : UNE notion de délégation. Le premier lot avait écrit un second
 * mandat (`linkedin_mandates`) ; deux mécanismes de délégation divergeraient, et le jour où ils
 * divergent c'est l'envoi qui perd (GA-26).
 *
 * Ordre — la contrainte est élargie AVANT le code qui écrit la valeur (GA-11 / GA-12) :
 *  1. la portée `linkedin_send` entre dans les deux contraintes de portée (mandat ET message) ;
 *  2. la colonne `daily_limit` (borne PAR JOUR, 1 à 25 — Louis : « c'est le compte LinkedIn du client
 *     qui est en jeu », contre les 50 du premier lot) ;
 *  3. REPRISE sans rien perdre : chaque ligne de `linkedin_mandates` devient une délégation de portée
 *     `linkedin_send`, avec le MÊME `id` — `linkedin_send_log.mandate_id` continue donc de pointer
 *     juste. Une borne posée au-dessus de 25 est ramenée à 25 (la décision l'abaisse).
 *
 * On archive, on ne supprime pas : `linkedin_mandates` reste en place, plus lue ni écrite ; une
 * délégation révoquée garde son `revoked_at`. Aucune ligne n'est jamais détruite par `up`.
 */
export class LinkedInMandateIntoDelegations1796591406829 implements MigrationInterface {
  public name = 'LinkedInMandateIntoDelegations1796591406829'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE outreach_delegations DROP CONSTRAINT IF EXISTS outreach_delegations_scope_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_delegations ADD CONSTRAINT outreach_delegations_scope_check
        CHECK (scope IN ('campaign', 'workspace_sequences', 'laura_send', 'payment_reminder', 'meeting_follow_up', 'linkedin_send'))
    `)
    await queryRunner.query(
      `ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_mandate_scope_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_mandate_scope_check
        CHECK (mandate_scope IS NULL OR mandate_scope IN ('campaign', 'workspace_sequences', 'laura_send', 'payment_reminder', 'meeting_follow_up', 'linkedin_send'))
    `)

    await queryRunner.query(`ALTER TABLE outreach_delegations ADD COLUMN IF NOT EXISTS daily_limit integer NULL`)
    await queryRunner.query(
      `ALTER TABLE outreach_delegations DROP CONSTRAINT IF EXISTS outreach_delegations_daily_limit_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_delegations ADD CONSTRAINT outreach_delegations_daily_limit_check
        CHECK (daily_limit IS NULL OR daily_limit BETWEEN 1 AND 25)
    `)

    // Reprise : même id, mêmes dates, révocation conservée. Un jour compte au moins 1 pour le total.
    await queryRunner.query(`
      INSERT INTO outreach_delegations
        (id, workspace_id, user_id, scope, renewed_from, campaign_label, contact_ids, channels, sender_mailbox_id,
         messages, content_hash, window_start_hour, window_end_hour, starts_at, expires_at, max_messages,
         sent_count, daily_limit, validated_by, validated_at, revoked_at, paused_at, created_at)
      SELECT
         m.id, m.workspace_id, m.user_id, 'linkedin_send', NULL, 'LinkedIn', '[]'::jsonb, '[]'::jsonb, 'linkedin',
         '[]'::jsonb, NULL, 0, 24, m.valid_from, m.valid_until,
         LEAST(m.daily_limit, 25) * GREATEST(1, CEIL(EXTRACT(EPOCH FROM (m.valid_until - m.valid_from)) / 86400)::integer),
         (SELECT COUNT(*)::integer FROM linkedin_send_log l WHERE l.mandate_id = m.id AND l.status IN ('sent', 'unknown')),
         LEAST(m.daily_limit, 25), jsonb_build_array(m.user_id::text), m.granted_at, m.revoked_at, NULL, m.created_at
      FROM linkedin_mandates m
      ON CONFLICT (id) DO NOTHING
    `)
    await queryRunner.query(
      `COMMENT ON TABLE linkedin_mandates IS 'ARCHIVÉE (#4737 K2, 29/10/2026) : reprise dans outreach_delegations (scope linkedin_send), plus lue ni écrite.'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rien ne se perd au retour : les mandats nés depuis la fusion repassent dans la table archivée.
    await queryRunner.query(`
      INSERT INTO linkedin_mandates (id, workspace_id, user_id, granted_at, valid_from, valid_until, daily_limit, revoked_at, created_at)
      SELECT d.id, d.workspace_id, d.user_id, d.validated_at, d.starts_at, d.expires_at, COALESCE(d.daily_limit, 25), d.revoked_at, d.created_at
      FROM outreach_delegations d WHERE d.scope = 'linkedin_send'
      ON CONFLICT (id) DO NOTHING
    `)
    await queryRunner.query(`DELETE FROM outreach_delegations WHERE scope = 'linkedin_send'`)
    await queryRunner.query(
      `ALTER TABLE outreach_delegations DROP CONSTRAINT IF EXISTS outreach_delegations_daily_limit_check`,
    )
    await queryRunner.query(`ALTER TABLE outreach_delegations DROP COLUMN IF EXISTS daily_limit`)
    await queryRunner.query(
      `ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_mandate_scope_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_mandate_scope_check
        CHECK (mandate_scope IS NULL OR mandate_scope IN ('campaign', 'workspace_sequences', 'laura_send', 'payment_reminder', 'meeting_follow_up'))
    `)
    await queryRunner.query(
      `ALTER TABLE outreach_delegations DROP CONSTRAINT IF EXISTS outreach_delegations_scope_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_delegations ADD CONSTRAINT outreach_delegations_scope_check
        CHECK (scope IN ('campaign', 'workspace_sequences', 'laura_send', 'payment_reminder', 'meeting_follow_up'))
    `)
    await queryRunner.query(`COMMENT ON TABLE linkedin_mandates IS NULL`)
  }
}
