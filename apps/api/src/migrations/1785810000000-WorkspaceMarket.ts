import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Market (target country) per workspace.
 *
 * Adds `workspaces.market` — the 2-letter code (`FR`/`CH`/`BE`/`LU`) that drives
 * a run's data sources, default locale and legal basis, and that propagates to
 * the IA as the `country` param its country packs expect. `DEFAULT 'FR'` +
 * `NOT NULL` means every existing workspace keeps the strictly-unchanged French
 * path: no row is reclassified, and a run only leaves the FR default once an
 * owner/admin picks another market in Réglages › Équipe.
 */
export class WorkspaceMarket1785810000000 implements MigrationInterface {
  public name = 'WorkspaceMarket1785810000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'FR'`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
