import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Anti password-sharing: per-(user, device) session registry.
 *
 * Powers the concurrent-device cap (2 active devices/user, LRU eviction) and the
 * real "Sessions actives" list. `device_id` = the HttpOnly `bellum_did` cookie;
 * `revoked_at` marks an evicted device (its next refresh is rejected).
 */
export class UserSessions1785400000000 implements MigrationInterface {
  public name = 'UserSessions1785400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        device_id text NOT NULL,
        ip text,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_user_device ON user_sessions (user_id, device_id)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_user_sessions_user ON user_sessions (user_id)`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
