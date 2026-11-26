import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `user_mfa` — per-user TOTP two-factor factor (RFC 6238). The Base32 secret is
 * stored encrypted at the application layer (AES-256-GCM), so the column is an
 * opaque TEXT here. One factor per user — enforced by the `user_id` primary key.
 * `enabled` gates login only once the first code has been verified. RLS scopes
 * rows to their owner. Migration owned here (NestJS = owner of métier tables).
 */
export class UserMfa1784300000000 implements MigrationInterface {
  public name = 'UserMfa1784300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_mfa (
        user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        secret_encrypted TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own MFA factor"
        ON user_mfa
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
