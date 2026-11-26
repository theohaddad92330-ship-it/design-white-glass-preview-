import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3699.6 — LA PREUVE DES PIÈCES JOINTES d'un envoi individuel, ce que la base
 * doit accepter AVANT le code qui l'écrit (GA-11/GA-12).
 *
 * `contacts.email_send_attachments` — la liste des pièces de la DERNIÈRE
 * tentative d'envoi, posée avec la réservation (`email_send_state`) : nom,
 * taille, empreinte SHA-256 des octets réellement relus pour partir. JAMAIS le
 * contenu, jamais un chemin de magasin. `NULL` = tentative sans pièce, ou
 * antérieure à ce lot — aucun backfill (on ne réinvente pas ce qui est parti).
 *
 * Le CHECK borne la FORME (un tableau JSON), pas le détail : le schéma de
 * chaque élément est tenu par le contrat (`contactSendAttachmentProofSchema`).
 *
 * Additive seulement : aucune ligne existante n'est touchée.
 */
export class ContactEmailSendAttachments1796437901202 implements MigrationInterface {
  public name = 'ContactEmailSendAttachments1796437901202'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_send_attachments jsonb`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_send_attachments_check`)
    await queryRunner.query(`
      ALTER TABLE contacts ADD CONSTRAINT contacts_email_send_attachments_check
        CHECK (email_send_attachments IS NULL OR jsonb_typeof(email_send_attachments) = 'array')
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN contacts.email_send_attachments IS
        '#3699.6 - pieces jointes de la derniere tentative d''envoi individuel : nom, taille, empreinte SHA-256. Jamais le contenu.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_send_attachments_check`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS email_send_attachments`)
  }
}
