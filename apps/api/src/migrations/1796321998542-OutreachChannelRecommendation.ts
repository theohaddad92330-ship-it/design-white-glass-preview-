import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2947 / #2204.40 — « Message de recommandation » : le sixième canal de
 * `OUTREACH_MESSAGE_CHANNELS`, distinct de l'intent `get_referral`
 * (`OUTREACH_INTENTS` — l'OBJECTIF « être recommandé auprès d'un tiers »,
 * qui peut se poursuivre par email/linkedin/phone) : ici c'est le FORMAT du
 * message lui-même qui diffère (un texte d'appui, pas une ouverture de
 * conversation).
 *
 * ⚠️ LES DEUX CONTRAINTES SONT ÉLARGIES AVANT LE CODE QUI ÉCRIT LA VALEUR
 * (GA-11/GA-12), même discipline que `OutreachChannelVoicemail1796321401516` :
 * `outreach_messages_channel_check` ET `message_style_templates_channel_check`
 * lisent le MÊME enum TypeScript (GA-26, `outreach-canonical.ts`).
 *
 * `recommendation` s'AJOUTE EN FIN (GA-08) — les valeurs qui précèdent,
 * `voicemail` compris, sont recopiées à l'identique.
 */
export class OutreachChannelRecommendation1796321998542 implements MigrationInterface {
  public name = 'OutreachChannelRecommendation1796321998542'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_messages
        DROP CONSTRAINT IF EXISTS outreach_messages_channel_check
    `)
    await queryRunner.query(`
      ALTER TABLE outreach_messages
        ADD CONSTRAINT outreach_messages_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'manual', 'voicemail', 'recommendation'))
    `)

    await queryRunner.query(`
      ALTER TABLE message_style_templates
        DROP CONSTRAINT IF EXISTS message_style_templates_channel_check
    `)
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        ADD CONSTRAINT message_style_templates_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'manual', 'voicemail', 'recommendation'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
