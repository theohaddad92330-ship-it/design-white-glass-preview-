import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Adds the rich contact-detail columns backing the contact page
 * (`/contacts/:id`). All nullable so existing rows are unaffected — the API
 * returns the full contact shape with `null` until a field is populated.
 *
 *  - scalars : contact_score (/10), language, timezone, location, seniority,
 *              scope, budget_authority
 *  - jsonb   : key_points (string[]), signals[], activity[], relations[]
 */
export class ContactDetailFields1782000000001 implements MigrationInterface {
  public name = 'ContactDetailFields1782000000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS contact_score integer,
        ADD COLUMN IF NOT EXISTS language text,
        ADD COLUMN IF NOT EXISTS timezone text,
        ADD COLUMN IF NOT EXISTS location text,
        ADD COLUMN IF NOT EXISTS seniority text,
        ADD COLUMN IF NOT EXISTS scope text,
        ADD COLUMN IF NOT EXISTS budget_authority text,
        ADD COLUMN IF NOT EXISTS key_points jsonb,
        ADD COLUMN IF NOT EXISTS signals jsonb,
        ADD COLUMN IF NOT EXISTS activity jsonb,
        ADD COLUMN IF NOT EXISTS relations jsonb
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
