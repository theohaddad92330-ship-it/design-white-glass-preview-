import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2947 / #2370 — les canaux de message qui manquaient au contrat (`OUTREACH_MESSAGE_CHANNELS`) :
 * SMS, WhatsApp, tâche/note, demande d'introduction, message partenaire, e-mail de suivi, push de profil
 * consultant, note de connexion LinkedIn. Laura les PRÉPARE ; le commercial les envoie — aucun envoi
 * automatique (le balayeur d'envoi ne connaît que `email`, `outreach-send.sweeper.ts`).
 *
 * ⚠️ LES CINQ CONTRAINTES QUI LISENT UN VOCABULAIRE DE CANAL SONT ÉLARGIES AVANT LE CODE QUI ÉCRIT LA VALEUR
 * (GA-11/GA-12) :
 *  · `outreach_messages_channel_check`, `message_style_templates_channel_check`,
 *    `outreach_approved_templates_channel_check` — les trois lisent `OUTREACH_MESSAGE_CHANNELS` (GA-26) ;
 *  · `engagement_drafts_channel_check`, `message_draft_versions_channel_check` — le composer
 *    (`ENGAGEMENT_DRAFT_CHANNELS`, `MESSAGE_DRAFT_CHANNELS`), qui connaît déjà `task`.
 *
 * Les valeurs qui précèdent sont recopiées à l'identique, les nouvelles s'ajoutent en fin (GA-08).
 * // #2370.sms #2370.whatsapp #2370.task #2370.introduction_request #2370.partner_message
 * // #2370.follow_up_email #2370.profile_push #2370.linkedin_connection_note
 */
export class OutreachChannelsSmsWhatsappAndPrepared1796560200370 implements MigrationInterface {
  public name = 'OutreachChannelsSmsWhatsappAndPrepared1796560200370'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Les listes sont écrites en toutes lettres (jamais interpolées) : GA-12 lit la valeur dans le SQL.
    await queryRunner.query(`ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_channel_check`)
    await queryRunner.query(`
      ALTER TABLE outreach_messages
        ADD CONSTRAINT outreach_messages_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'manual', 'voicemail', 'recommendation', 'sms', 'whatsapp', 'task', 'introduction_request', 'partner_message', 'follow_up_email', 'profile_push', 'linkedin_connection_note'))
    `)

    await queryRunner.query(
      `ALTER TABLE message_style_templates DROP CONSTRAINT IF EXISTS message_style_templates_channel_check`,
    )
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        ADD CONSTRAINT message_style_templates_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'manual', 'voicemail', 'recommendation', 'sms', 'whatsapp', 'task', 'introduction_request', 'partner_message', 'follow_up_email', 'profile_push', 'linkedin_connection_note'))
    `)

    await queryRunner.query(
      `ALTER TABLE outreach_approved_templates DROP CONSTRAINT IF EXISTS outreach_approved_templates_channel_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_approved_templates
        ADD CONSTRAINT outreach_approved_templates_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'manual', 'voicemail', 'recommendation', 'sms', 'whatsapp', 'task', 'introduction_request', 'partner_message', 'follow_up_email', 'profile_push', 'linkedin_connection_note'))
    `)

    await queryRunner.query(`ALTER TABLE engagement_drafts DROP CONSTRAINT IF EXISTS engagement_drafts_channel_check`)
    await queryRunner.query(`
      ALTER TABLE engagement_drafts
        ADD CONSTRAINT engagement_drafts_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'task', 'voicemail', 'recommendation', 'sms', 'whatsapp', 'introduction_request', 'partner_message', 'follow_up_email', 'profile_push', 'linkedin_connection_note'))
    `)

    await queryRunner.query(
      `ALTER TABLE message_draft_versions DROP CONSTRAINT IF EXISTS message_draft_versions_channel_check`,
    )
    await queryRunner.query(`
      ALTER TABLE message_draft_versions
        ADD CONSTRAINT message_draft_versions_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'task', 'voicemail', 'recommendation', 'sms', 'whatsapp', 'introduction_request', 'partner_message', 'follow_up_email', 'profile_push', 'linkedin_connection_note'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
