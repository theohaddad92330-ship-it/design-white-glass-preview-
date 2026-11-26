import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2160.58 — la confirmation positive « bon contact », symétrique du refus
 * (`contact_stops`). ADDITIVE, NULLABLE, sans CHECK : une fiche jamais
 * confirmée lit simplement `NULL`, jamais une confirmation devinée.
 */
export class ContactIdentityConfirmed1796001462218 implements MigrationInterface {
  name = 'ContactIdentityConfirmed1796001462218'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS identity_confirmed_at timestamptz;
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS identity_confirmed_by uuid;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts DROP COLUMN IF EXISTS identity_confirmed_by;
      ALTER TABLE contacts DROP COLUMN IF EXISTS identity_confirmed_at;
    `)
  }
}
