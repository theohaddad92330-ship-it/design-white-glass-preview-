import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Rich Apollo People-Match profile on contacts (`contacts.apollo_enrichment`,
 * JSONB) — mirrors the existing `accounts.apollo_enrichment` firmographic block
 * (ApolloMaxEnrichment #511). Stores the FACTUAL profile Apollo already returned
 * on the SAME paid People-Match: headline, career path, education, social links,
 * seniority, departments/functions, additional emails/phones. Present-only:
 * a field Apollo omits is absent here — nothing invented.
 *
 * Additif + idempotent (`ADD COLUMN IF NOT EXISTS`), colonne nullable, aucune
 * donnée existante touchée, RLS inchangée. Migration possédée par NestJS.
 */
export class ContactApolloEnrichment1786040000000 implements MigrationInterface {
  public name = 'ContactApolloEnrichment1786040000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS apollo_enrichment jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS apollo_enrichment`)
  }
}
