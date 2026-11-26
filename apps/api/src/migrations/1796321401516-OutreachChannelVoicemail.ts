import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2947 / #2204.41 — « Voicemail/note d'appel » : le cinquième canal de
 * `OUTREACH_MESSAGE_CHANNELS`, distinct de `phone` (un appel décroché) — un
 * message laissé quand l'appel n'aboutit pas se rédige différemment (pas de
 * question ouverte : personne n'y répond en direct).
 *
 * ⚠️ LES DEUX CONTRAINTES SONT ÉLARGIES AVANT LE CODE QUI ÉCRIT LA VALEUR
 * (GA-11/GA-12) : `outreach_messages_channel_check` ET
 * `message_style_templates_channel_check` lisent le MÊME enum TypeScript
 * (GA-26, `outreach-canonical.ts` — un style se pratique sur les mêmes canaux
 * qu'un message) ; les deux doivent donc être élargies ensemble, avant que
 * `voicemail` n'atteigne `OUTREACH_MESSAGE_CHANNELS`.
 *
 * `voicemail` s'AJOUTE EN FIN (GA-08) — les valeurs qui précèdent sont
 * recopiées à l'identique.
 */
export class OutreachChannelVoicemail1796321401516 implements MigrationInterface {
  public name = 'OutreachChannelVoicemail1796321401516'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_messages
        DROP CONSTRAINT IF EXISTS outreach_messages_channel_check
    `)
    await queryRunner.query(`
      ALTER TABLE outreach_messages
        ADD CONSTRAINT outreach_messages_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'manual', 'voicemail'))
    `)

    await queryRunner.query(`
      ALTER TABLE message_style_templates
        DROP CONSTRAINT IF EXISTS message_style_templates_channel_check
    `)
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        ADD CONSTRAINT message_style_templates_channel_check
        CHECK (channel IN ('email', 'linkedin', 'phone', 'manual', 'voicemail'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
