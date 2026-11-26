import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Widens the ``contacts.decision_role`` CHECK constraint to admit the deck
 * decision-role taxonomy assigned deterministically in Phase 3:
 * ``technical`` (DSI/CTO/RSSI…), ``economic`` (CFO/achats), ``user`` (métier).
 *
 * Without this, persisting a contact with one of the new roles fails with
 * ``violates check constraint "contacts_decision_role_check"`` — which aborts
 * the whole analysis at the contacts/classify phase. The old business roles are
 * kept so existing rows and LLM-fallback roles still validate.
 */
const ROLES = [
  'technical',
  'economic',
  'user',
  'champion',
  'sponsor',
  'operational',
  'purchasing',
  'influencer',
  'blocker',
  'unknown',
]

export class AddDeckDecisionRoles1781000000000 implements MigrationInterface {
  public name = 'AddDeckDecisionRoles1781000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const list = ROLES.map(r => `'${r}'`).join(',')
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_decision_role_check`)
    await queryRunner.query(
      `ALTER TABLE contacts ADD CONSTRAINT contacts_decision_role_check CHECK (decision_role IN (${list}))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_decision_role_check`)
    await queryRunner.query(
      `ALTER TABLE contacts ADD CONSTRAINT contacts_decision_role_check CHECK (decision_role IN ('sponsor','champion','operational','purchasing','influencer','blocker','unknown'))`,
    )
  }
}
