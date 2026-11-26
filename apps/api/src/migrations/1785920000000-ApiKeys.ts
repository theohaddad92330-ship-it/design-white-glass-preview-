import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `api_keys` — workspace-scoped keys for the public read API (`/v1/*`).
 *
 * Hash-only storage: the raw key (`blm_live_…`) is returned exactly once at
 * creation; only its SHA-256 hex is persisted (`key_hash`, UNIQUE — the
 * guard's constant-work lookup). `prefix` keeps a non-sensitive display hint
 * (`blm_live_xxxx`). Revocation is soft (`revoked_at`) so the row stays for
 * audit while the guard only matches `revoked_at IS NULL`.
 *
 * API-owned table (never read from the browser directly) → no RLS, mirroring
 * `analysis_runs` / the OAuth tables. `workspace_id`/`created_by` stay bare
 * uuids (no hard FK) so the audit survives a workspace/user deletion.
 */
export class ApiKeys1785920000000 implements MigrationInterface {
  public name = 'ApiKeys1785920000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        prefix TEXT NOT NULL,
        scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_uidx ON api_keys (key_hash)
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS api_keys_workspace_idx ON api_keys (workspace_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
