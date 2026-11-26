import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3439.1 — LA CONFIRMATION DES FAITS OBLIGATOIRES.
 *
 * `mandatory_facts` déclare ce qui doit être vrai avant qu'un scénario soit
 * proposé (identité du référent, accord de citation, relation documentée,
 * périmètre confirmé) ; rien ne permettait de le dire vrai. Cette colonne
 * porte `[{ fact, confirmedBy, confirmedAt }]` — un geste humain, par fait.
 * Ajoutée AVANT le code qui l'écrit (GA-11/GA-12).
 */
export class MessageLibraryFactConfirmations1796415137291 implements MigrationInterface {
  name = 'MessageLibraryFactConfirmations1796415137291'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE message_library_entries
        ADD COLUMN IF NOT EXISTS fact_confirmations jsonb NOT NULL DEFAULT '[]'::jsonb
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN message_library_entries.fact_confirmations IS
        'Faits de mandatory_facts confirmés par un humain : [{fact, confirmedBy, confirmedAt}]. Jamais déduit par le modèle.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE message_library_entries DROP COLUMN IF EXISTS fact_confirmations`)
  }
}
