import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3920.8 — les marchés publics ATTRIBUÉS lus en continu pour un compte suivi
 * (source `decp`, genre `award`) + le curseur de leur premier passage
 * (`awards_checked_at`).
 *
 * GA-11/GA-12 : les deux CHECK s'élargissent AVANT le code qui écrit les valeurs.
 * Aucun rattrapage : valeurs NEUVES, aucune ligne existante à requalifier.
 */
export class PublicRegistryAwards1796545000000 implements MigrationInterface {
  public name = 'PublicRegistryAwards1796545000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_source_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_source_check CHECK (source IN ('bodacc', 'sirene', 'decp'))
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_kind_check CHECK (kind IN (
        'collective_proceeding', 'creation', 'sale', 'accounts_filing',
        'modification', 'deregistration', 'new_establishment', 'executive_change',
        'headcount_change', 'award', 'other'))
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_watch_state
      ADD COLUMN IF NOT EXISTS awards_checked_at timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM public_registry_announcements WHERE source = 'decp' OR kind = 'award'`)
    await queryRunner.query(`ALTER TABLE public_registry_watch_state DROP COLUMN IF EXISTS awards_checked_at`)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_kind_check CHECK (kind IN (
        'collective_proceeding', 'creation', 'sale', 'accounts_filing',
        'modification', 'deregistration', 'new_establishment', 'executive_change',
        'headcount_change', 'other'))
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_source_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_source_check CHECK (source IN ('bodacc', 'sirene'))
    `)
  }
}
