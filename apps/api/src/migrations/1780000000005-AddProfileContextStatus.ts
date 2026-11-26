import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * ENG-149 — Track the Profiler's outcome on `profiles`.
 *
 * Source of truth so the welcome screen can distinguish "still running"
 * from "failed silently". Default `not_generated` covers existing rows
 * that pre-date the Profiler integration.
 */
export class AddProfileContextStatus1780000000005 implements MigrationInterface {
  public name = 'AddProfileContextStatus1780000000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_context_status TEXT NOT NULL DEFAULT 'not_generated'`,
    )
    // Backfill: rows that already have a profile_context belong to the
    // pre-status era and should be considered succeeded.
    await queryRunner.query(
      `UPDATE profiles SET profile_context_status = 'succeeded' WHERE profile_context IS NOT NULL AND profile_context_status = 'not_generated'`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
