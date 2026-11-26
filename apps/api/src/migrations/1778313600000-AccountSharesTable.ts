import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Public share links for account dossiers — slug-based, no JWT in the URL.
 * Each row maps a unique slug to an account; the read endpoint resolves
 * by slug, so revoking a share = deleting the row.
 */
export class AccountSharesTable1778313600000 implements MigrationInterface {
  public name = 'AccountSharesTable1778313600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_shares (
        id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        slug        TEXT         NOT NULL UNIQUE,
        account_id  UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        user_id     UUID         NOT NULL,
        expires_at  TIMESTAMPTZ  NOT NULL,
        revoked_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS account_shares_account_id_idx ON account_shares (account_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS account_shares_user_id_idx ON account_shares (user_id)`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
