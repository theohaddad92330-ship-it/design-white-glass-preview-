import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Widen ``contacts.source`` to admit ``dropcontact``.
 *
 * The on-demand contact enrichment can now fall back to Dropcontact (RGPD-safe,
 * algorithmic — no stored pre-scraped database) when Apollo resolves nothing and
 * ``DROPCONTACT_API_KEY`` is set. A Dropcontact-resolved contact is stamped
 * ``source = 'dropcontact'`` so its provenance is honest; the previous CHECK
 * rejected that value, which would have failed the enrich UPDATE. Additive: every
 * prior source stays admitted, Apollo (env-gated fallback OFF) is unchanged.
 */
export class AddDropcontactContactSource1785790000000 implements MigrationInterface {
  public name = 'AddDropcontactContactSource1785790000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
