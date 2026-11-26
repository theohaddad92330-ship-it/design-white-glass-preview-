import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3234 / #3211.11 — l'identifiant de message du FOURNISSEUR sur `outreach_messages`.
 *
 * Décision Louis (11/10/2026) : `send()` rend le reçu du fournisseur et une
 * réponse entrante s'apparie à l'envoi par cet identifiant, avant l'heuristique
 * d'adresse. Migration ADDITIVE : deux colonnes texte NULLABLES, aucune
 * contrainte à élargir (aucune valeur énumérée), rien n'est réécrit.
 *
 * Jamais le corps du message : uniquement des identifiants opaques.
 */
export class OutreachMessageProviderIds1796440427163 implements MigrationInterface {
  public name = 'OutreachMessageProviderIds1796440427163'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS provider_message_id text`)
    await queryRunner.query(`ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS provider_thread_id text`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outreach_messages_provider_thread
        ON outreach_messages (user_id, provider_thread_id)
        WHERE provider_thread_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_outreach_messages_provider_thread`)
    await queryRunner.query(`ALTER TABLE outreach_messages DROP COLUMN IF EXISTS provider_thread_id`)
    await queryRunner.query(`ALTER TABLE outreach_messages DROP COLUMN IF EXISTS provider_message_id`)
  }
}
