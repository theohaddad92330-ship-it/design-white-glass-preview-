import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Grant the `postgres` role full privileges on `public`, mirroring the
 * PostgREST `service_role` shortcut. The NestJS API now owns DB access
 * directly via TypeORM and enforces authorization in the service layer
 * (every query filters by `userId` derived from the validated JWT).
 *
 * RLS stays ENABLED on every table — it remains a defense-in-depth layer for
 * any other connection (Studio, manual psql, future direct clients).
 *
 * The companion `ALTER ROLE postgres BYPASSRLS` lives outside this migration
 * because it requires a true superuser (supautils blocks it in Supabase
 * environments). Apply it as `supabase_admin`:
 *   - Local: `tools/db-reset.sh` runs it via `docker exec`.
 *   - Supabase Cloud: run it once in the SQL editor as the project owner.
 */
export class DisableRlsForApi1777276800000 implements MigrationInterface {
  public name = 'DisableRlsForApi1777276800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres`)
    await queryRunner.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres`)
    await queryRunner.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres`)
    await queryRunner.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
