import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * ENG-148 — Persist the Profiler agent's output on `profiles`.
 *
 * The IA service (`apps/ia/app/agents/profiler.py`) writes `profile_context`
 * to `profiles` after every Temps-1 save. Earlier environments created the
 * column out-of-band via Supabase; this migration normalizes that across
 * fresh installs and existing databases.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export class AddProfileContextColumn1780000000004 implements MigrationInterface {
  public name = 'AddProfileContextColumn1780000000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_context JSONB`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
