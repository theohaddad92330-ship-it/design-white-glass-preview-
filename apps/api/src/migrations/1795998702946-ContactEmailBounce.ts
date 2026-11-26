import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2733 (SKAIZen Group, 22/09/2026) — « un e-mail vers une adresse
 * inexistante reste marqué envoyé ». `contacts.email_sent_at` ne prouve que
 * l'ACCEPTATION par Resend, jamais la livraison (doctrine
 * c73_fait_ne_porte_pas_preuve_denvoi) — et rien dans le dépôt ne relisait
 * jamais un rebond fournisseur.
 *
 * Trois colonnes, AJOUT SEULEMENT — aucune n'écrase `email_sent_at` (on
 * archive, on ne supprime pas) :
 *
 *  - `email_provider_message_id` : l'identifiant Resend de l'envoi, seule clé
 *    qui relie un événement `email.bounced` du webhook à CE contact.
 *  - `email_bounced_at` : la vérité de LIVRAISON, posée par le webhook
 *    (`ResendWebhookController`), jamais par un écran.
 *  - `email_bounce_reason` : le type de rebond tel que Resend le nomme.
 *
 * Toutes nullable, sans défaut : les contacts déjà envoyés avant ce lot
 * restent `email_bounced_at IS NULL` — pas un rebond détecté rétroactivement
 * (Resend ne redonne jamais un identifiant après coup), pas un « livré »
 * inventé non plus. L'écran continue de dire ce qu'il sait, ni plus.
 */
export class ContactEmailBounce1795998702946 implements MigrationInterface {
  public name = 'ContactEmailBounce1795998702946'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS email_provider_message_id text,
        ADD COLUMN IF NOT EXISTS email_bounced_at timestamptz,
        ADD COLUMN IF NOT EXISTS email_bounce_reason text
    `)
    // Un envoi bien identifié se recherche déjà par cet identifiant — l'index
    // sert la seule requête du webhook (`WHERE email_provider_message_id = $1`).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contacts_email_provider_message_id_idx
        ON contacts (email_provider_message_id)
        WHERE email_provider_message_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS contacts_email_provider_message_id_idx`)
    await queryRunner.query(`
      ALTER TABLE contacts
        DROP COLUMN IF EXISTS email_provider_message_id,
        DROP COLUMN IF EXISTS email_bounced_at,
        DROP COLUMN IF EXISTS email_bounce_reason
    `)
  }
}
