import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2185.57 — « Consentement : restrictions » : ce que la personne a EXCLU de
 * son accord (« pas de mission chez tel concurrent », « ne pas partager mon
 * CV avant le 1er »), distinct de `consent_basis` (la base légale, en clair)
 * et de `consent_given_at`/`consent_expires_at` (la fenêtre de validité).
 *
 * ADDITIVE, NULLABLE, sans CHECK — même patron que `consent_basis` : une
 * fiche sans restriction connue lit `NULL`, jamais une chaîne vide qui se
 * lirait « la personne a confirmé n'avoir AUCUNE restriction ».
 */
export class ConsultantConsentRestrictions1796321350100 implements MigrationInterface {
  name = 'ConsultantConsentRestrictions1796321350100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants ADD COLUMN IF NOT EXISTS consent_restrictions text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants DROP COLUMN IF EXISTS consent_restrictions;
    `)
  }
}
