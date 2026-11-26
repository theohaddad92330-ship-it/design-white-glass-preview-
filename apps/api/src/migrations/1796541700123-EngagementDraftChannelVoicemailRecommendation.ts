import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2204.40 / #2204.41 (épopée #2947) — « Message de recommandation » et « Message vocal / note d'appel » entrent dans
 * le composer. Le générateur IA les rédige déjà (`routers/message.py`) et `outreach_messages` /
 * `message_style_templates` les acceptent depuis `OutreachChannelVoicemail` et `OutreachChannelRecommendation`.
 *
 * ⚠️ LES DEUX CONTRAINTES QUI RESTAIENT À QUATRE VALEURS SONT ÉLARGIES AVANT LE CODE QUI ÉCRIT LA VALEUR (GA-11/GA-12) :
 * `engagement_drafts_channel_check` (le brouillon enregistré avec son brief) et
 * `message_draft_versions_channel_check` (les versions successives d'un brouillon). Les valeurs qui précèdent sont
 * recopiées à l'identique, les deux nouvelles s'ajoutent en fin (GA-08).
 */
export class EngagementDraftChannelVoicemailRecommendation1796541700123 implements MigrationInterface {
  public name = 'EngagementDraftChannelVoicemailRecommendation1796541700123'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE engagement_drafts DROP CONSTRAINT IF EXISTS engagement_drafts_channel_check`)
    await queryRunner.query(`
      ALTER TABLE engagement_drafts
        ADD CONSTRAINT engagement_drafts_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'task', 'voicemail', 'recommendation'))
    `)
    await queryRunner.query(
      `ALTER TABLE message_draft_versions DROP CONSTRAINT IF EXISTS message_draft_versions_channel_check`,
    )
    await queryRunner.query(`
      ALTER TABLE message_draft_versions
        ADD CONSTRAINT message_draft_versions_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'task', 'voicemail', 'recommendation'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
