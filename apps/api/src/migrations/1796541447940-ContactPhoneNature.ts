import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4178.1 — la NATURE d'un numéro (pro vérifié / déclaré / personnel /
 * inconnue) et sa source (fournisseur / correction humaine). Contrainte posée
 * AVANT le code qui l'écrit (GA-11 / GA-12).
 *
 * Backfill ciblé (« un correctif de collecte rattrape l'existant ») : tout
 * numéro déjà en base, jamais qualifié, était lu comme professionnel par
 * déduction — il devient « inconnue ». Idempotent (`phone_nature IS NULL`),
 * et une correction humaine n'est jamais écrasée.
 */
export class ContactPhoneNature1796541447940 implements MigrationInterface {
  name = 'ContactPhoneNature1796541447940'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_nature text`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_nature_source text`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_nature_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_phone_nature_check
      CHECK (phone_nature IS NULL OR phone_nature IN ('professional_verified', 'professional_declared', 'personal', 'unknown'))
    `)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_nature_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_phone_nature_source_check
      CHECK (phone_nature_source IS NULL OR phone_nature_source IN ('provider', 'human'))
    `)
    await queryRunner.query(`
      UPDATE contacts SET phone_nature = 'unknown', phone_nature_source = 'provider'
      WHERE phone IS NOT NULL AND phone <> '' AND phone_nature IS NULL AND phone_nature_source IS DISTINCT FROM 'human'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
