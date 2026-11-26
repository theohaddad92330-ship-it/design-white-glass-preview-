import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Widen ``contacts.source`` to admit ``pappers`` and ``manual``.
 *
 * seedPappersContacts stamps registry directors (dirigeants Pappers) with
 * ``source = 'pappers'``, but the previous CHECK didn't allow it, so
 * ``normaliseSource`` fell those rows back to ``ai_generated`` — which the
 * telemetry then tags HYPOTHÈSE instead of PUBLIC. Real public dirigeants were
 * showing as inferred. Admitting ``pappers`` (→ PUBLIC) fixes the provenance.
 */
export class AddPappersContactSource1782500000000 implements MigrationInterface {
  public name = 'AddPappersContactSource1782500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
