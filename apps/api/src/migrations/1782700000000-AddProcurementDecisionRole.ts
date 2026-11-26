import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add ``procurement`` to ``contacts.decision_role``.
 *
 * V1-vendable §7.7 lists procurement as a distinct decision role (the achats
 * gatekeeper an ESN must handle) — previously vendor / IT-procurement titles were
 * folded into ``economic``. The classifier now emits ``procurement`` and the API
 * maps the legacy ``purchasing`` value onto it, so the CHECK must admit it.
 */
export class AddProcurementDecisionRole1782700000000 implements MigrationInterface {
  public name = 'AddProcurementDecisionRole1782700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_decision_role_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_decision_role_check
      CHECK (decision_role = ANY (ARRAY[
        'technical','economic','procurement','user','champion',
        'sponsor','operational','purchasing','influencer','blocker','unknown'
      ]))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
