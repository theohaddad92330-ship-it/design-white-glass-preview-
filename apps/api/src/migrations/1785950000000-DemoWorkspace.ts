import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Demo mode (chantier C1 Théo — mode démo stable pour la vidéo + démos clients).
 *
 * 1. `workspaces.is_demo` — marks a workspace as a DEMO space: its actions never
 *    debit credits (short-circuited in CreditsService), real analyses are
 *    replaced by a replay of the seeded golden dossiers, and the web shows a
 *    permanent « Mode démo » banner. `DEFAULT false` + `NOT NULL` = every
 *    existing workspace keeps the strictly-unchanged real-billing path; a
 *    workspace only becomes demo via the admin backoffice endpoint.
 *
 * 2. Widen `contacts_source_check` to admit `demo` — the seeded demo contacts
 *    are FICTIONAL by design (the explicit exception to « JAMAIS de données
 *    fictives ») and must be honestly stamped `source = 'demo'` so they can
 *    never be mistaken for (or mixed with) real prospect data. Additive: every
 *    prior source stays admitted.
 */
export class DemoWorkspace1785950000000 implements MigrationInterface {
  public name = 'DemoWorkspace1785950000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact', 'demo'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
