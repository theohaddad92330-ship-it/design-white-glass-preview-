import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Re-asserts the pinned `search_path` on `handle_new_user` and
 * `handle_new_user_credits`.
 *
 * Originally written to fix a Supabase Cloud bug where these triggers ran as
 * `supabase_auth_admin` (default search_path: `auth, extensions`) and failed
 * with "relation user_credits does not exist". The `Init` migration now bakes
 * the same `SET search_path` clause from the start, so this migration is a
 * no-op on fresh databases — kept for environments whose schema was created
 * by an earlier Init that lacked the fix.
 *
 * `SET ROLE supabase_admin` is no longer needed: the functions are now owned
 * by the role that runs migrations (the connection user), which can
 * `CREATE OR REPLACE` its own functions without elevation.
 */
export class FixNewUserTriggers1777190400000 implements MigrationInterface {
  public name = 'FixNewUserTriggers1777190400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      BEGIN
        INSERT INTO profiles (user_id) VALUES (NEW.id);
        RETURN NEW;
      END;
      $$
    `)

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user_credits()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      BEGIN
        INSERT INTO user_credits (user_id, plan, accounts_limit)
        VALUES (NEW.id, 'free', 3);
        RETURN NEW;
      END;
      $$
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
