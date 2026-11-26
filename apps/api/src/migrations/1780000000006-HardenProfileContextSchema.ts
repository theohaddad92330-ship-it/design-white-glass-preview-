import { MigrationInterface, QueryRunner } from 'typeorm'

export class HardenProfileContextSchema1780000000006 implements MigrationInterface {
  public name = 'HardenProfileContextSchema1780000000006'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_profile_context_status_check`)
    await queryRunner.query(
      `ALTER TABLE profiles ADD CONSTRAINT profiles_profile_context_status_check CHECK (profile_context_status IN ('not_generated', 'generating', 'succeeded', 'validated', 'failed'))`,
    )

    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_context_validated_at TIMESTAMPTZ`)
    await queryRunner.query(
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_context_version INTEGER NOT NULL DEFAULT 0`,
    )

    // Backfill: rows that already carry a context predate versioning and are
    // schema v1 by construction. Empty rows stay at v0 until generated.
    await queryRunner.query(
      `UPDATE profiles SET profile_context_version = 1 WHERE profile_context IS NOT NULL AND profile_context_version = 0`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
