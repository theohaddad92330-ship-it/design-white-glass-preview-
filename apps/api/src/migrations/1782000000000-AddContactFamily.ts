import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Adds ``contacts.family`` — the business-family taxonomy (IT / Cyber / Data /
 * IA / Infra / Dev / PMO / Finance / C-Level / Achat / RH) assigned by the
 * Phase 3 classify prompt. Nullable: NULL = not classified (UI shows "—").
 * Free text (no CHECK) so a new family label never aborts an analysis.
 */
export class AddContactFamily1782000000000 implements MigrationInterface {
  public name = 'AddContactFamily1782000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS family TEXT`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS family`)
  }
}
