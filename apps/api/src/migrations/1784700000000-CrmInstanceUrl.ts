import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add `instance_url` to `crm_connections`. Salesforce (unlike HubSpot) returns a
 * per-org `instance_url` at OAuth time that every subsequent REST call must be
 * addressed to. HubSpot rows leave it NULL. Nullable + additive → non-breaking
 * for the existing HubSpot link. RLS/indexes on the table are unchanged.
 */
export class CrmInstanceUrl1784700000000 implements MigrationInterface {
  public name = 'CrmInstanceUrl1784700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_connections ADD COLUMN IF NOT EXISTS instance_url TEXT`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
