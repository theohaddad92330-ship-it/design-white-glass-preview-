import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3699.4/.5 (06/10/2026) — LE SORT D'UN ENVOI INDIVIDUEL : état, canal,
 * expéditeur réel, instant de la tentative.
 *
 * Quatre colonnes sur `contacts` plutôt qu'une table d'envois : un contact a UN
 * envoi individuel courant (`email_sent_at` l'a toujours dit), et l'écran le lit
 * déjà d'une requête. `NULL` = aucune tentative enregistrée — les lignes d'avant
 * ne sont JAMAIS rétro-calculées (doctrine : on n'affiche pas ce qu'on n'a pas).
 *
 * Énumérations miroirs : `CONTACT_SEND_STATES` et `CONTACT_SEND_CHANNELS`
 * (`@bellum/contracts`). Contraintes posées AVANT le code qui écrit (GA-11/GA-12).
 */
export class ContactEmailSendState1796436300000 implements MigrationInterface {
  name = 'ContactEmailSendState1796436300000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_send_state text;
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_send_channel text;
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_send_from text;
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_send_attempted_at timestamptz;
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_send_state_check;
      ALTER TABLE contacts ADD CONSTRAINT contacts_email_send_state_check CHECK (email_send_state IS NULL OR email_send_state IN ('claimed', 'handed_off', 'failed', 'uncertain'));
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_send_channel_check;
      ALTER TABLE contacts ADD CONSTRAINT contacts_email_send_channel_check CHECK (email_send_channel IS NULL OR email_send_channel IN ('workspace', 'mailbox'));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_send_channel_check;
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_send_state_check;
      ALTER TABLE contacts DROP COLUMN IF EXISTS email_send_attempted_at;
      ALTER TABLE contacts DROP COLUMN IF EXISTS email_send_from;
      ALTER TABLE contacts DROP COLUMN IF EXISTS email_send_channel;
      ALTER TABLE contacts DROP COLUMN IF EXISTS email_send_state;
    `)
  }
}
