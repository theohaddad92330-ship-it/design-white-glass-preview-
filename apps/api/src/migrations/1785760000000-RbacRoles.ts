import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Role-based access control — widen the workspace role set (additive, non-breaking).
 *
 * Phase-1 (`1784000000000-MultiUserWorkspaces`) pinned the role columns to
 * `CHECK (role IN ('owner', 'admin', 'member'))`. This migration widens that
 * constraint on both `workspace_members` and `workspace_invitations` to admit
 * the four new RBAC seats an ESN can sell separately — `sales_ops`, `sales`,
 * `tech_admin` and the strictly read-only `viewer` — while keeping the three
 * legacy values valid.
 *
 * Deliberately additive:
 *  - The column `DEFAULT 'member'` is unchanged, so existing memberships and any
 *    future insert that omits a role stay `member`.
 *  - NO row is reclassified — there is no `UPDATE`. Every current member keeps
 *    exactly the role (and therefore the access) it has today.
 *  - Only the CHECK is relaxed (a strict superset of the old one), so no value
 *    that validated before can fail now.
 *
 * Postgres names the inline CHECK from the CREATE TABLE `<table>_<column>_check`.
 * We drop it `IF EXISTS` and recreate it with the widened value list, so a re-run
 * (or a table whose constraint was already widened) is safe.
 */
const ROLE_VALUES = ['owner', 'admin', 'sales_ops', 'sales', 'tech_admin', 'member', 'viewer']

/** SQL list literal: `'owner', 'admin', …` */
const ROLE_LIST = ROLE_VALUES.map(role => `'${role}'`).join(', ')

const TABLES = ['workspace_members', 'workspace_invitations'] as const

export class RbacRoles1785760000000 implements MigrationInterface {
  public name = 'RbacRoles1785760000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_role_check`)
      await queryRunner.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_role_check CHECK (role IN (${ROLE_LIST}))`)
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
