import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * R22 a4 (Louis 22/10/2026) — « COORDONNÉES : DISPONIBILITÉ + ENRICHIR ».
 *
 * La recherche gratuite annonce qu'un e-mail / un téléphone EXISTE sans le
 * livrer ; cette annonce ne vivait que dans `raw_data.apolloDetails` (jsonb),
 * illisible par la liste et perdue au premier enrichissement. Deux colonnes la
 * portent désormais, par champ : `available` (la source annonce qu'il existe) ·
 * `unknown` (elle ne dit rien) · `not_found` (cherché, rien).
 *
 * Contrainte SQL posée AVANT le code qui écrit (GA-11/12). NULLABLE, additive :
 * NULL = jamais annoncé, jamais une valeur devinée. La date de la dernière
 * recherche reste lue dans `enrichment_coordinates` (déjà en base).
 *
 * Rattrapage de l'existant : un drapeau déjà reçu (`apolloDetails.hasEmail` /
 * `hasPhone` vrai) sur un champ encore vide devient `available`.
 */
export class ContactCoordinateAvailability1796574871953 implements MigrationInterface {
  name = 'ContactCoordinateAvailability1796574871953'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_availability text`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_availability text`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_availability_check`)
    await queryRunner.query(`
      ALTER TABLE contacts ADD CONSTRAINT contacts_email_availability_check
      CHECK (email_availability IN ('available','unknown','not_found'))
    `)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_availability_check`)
    await queryRunner.query(`
      ALTER TABLE contacts ADD CONSTRAINT contacts_phone_availability_check
      CHECK (phone_availability IN ('available','unknown','not_found'))
    `)
    await queryRunner.query(`
      UPDATE contacts SET email_availability = 'available'
      WHERE email_availability IS NULL
        AND COALESCE(TRIM(email), '') = ''
        AND raw_data->'apolloDetails'->>'hasEmail' = 'true'
    `)
    await queryRunner.query(`
      UPDATE contacts SET phone_availability = 'available'
      WHERE phone_availability IS NULL
        AND COALESCE(TRIM(phone), '') = ''
        AND raw_data->'apolloDetails'->>'hasPhone' = 'true'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_availability_check`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_availability_check`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS phone_availability`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS email_availability`)
  }
}
