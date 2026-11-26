import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Extend accounts.status check constraint with the new terminal status
 * `canceled` used for user-initiated cancellation.
 */
export class AddCanceledStatusToAccounts1779200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('analyzing', 'completed', 'error', 'canceled'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('analyzing', 'completed', 'error'))`,
    )
  }
}
