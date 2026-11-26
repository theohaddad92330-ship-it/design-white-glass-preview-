import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Server-side filtering accelerators for `GET /accounts` and `GET /contacts`.
 *
 * - Enables `pg_trgm` so `ILIKE '%foo%'` can use a GIN index instead of a full scan.
 * - Adds trigram indexes on the columns hit by the search box:
 *     · accounts.company_name
 *     · contacts.full_name, contacts.title, contacts.email
 *
 * The existing `idx_accounts_status` / `idx_contacts_decision_role` already
 * cover the equality filters; nothing to add there.
 */
export class FilterIndexes1779004800000 implements MigrationInterface {
  public name = 'FilterIndexes1779004800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_company_name_trgm ON accounts USING gin (company_name gin_trgm_ops)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contacts_full_name_trgm ON contacts USING gin (full_name gin_trgm_ops)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contacts_title_trgm ON contacts USING gin (title gin_trgm_ops)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON contacts USING gin (email gin_trgm_ops)`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
