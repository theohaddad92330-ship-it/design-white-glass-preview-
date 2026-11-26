import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3921.9 — les événements du registre national des entreprises (RNE) lus en continu pour un
 * compte suivi (source `rne` : changement de dirigeant, ouverture et fermeture d'établissement)
 * + le curseur de leur premier passage (`rne_checked_at`).
 *
 * GA-11/GA-12 : les deux CHECK s'élargissent AVANT le code qui écrit les valeurs.
 * Aucun rattrapage : valeurs NEUVES, aucune ligne existante à requalifier.
 */
export class PublicRegistryRne1796560050638 implements MigrationInterface {
  public name = 'PublicRegistryRne1796560050638'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_source_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_source_check CHECK (source IN ('bodacc', 'sirene', 'decp', 'rne'))
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
        'headcount_change', 'award', 'establishment_closure', 'other'))
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_watch_state
      ADD COLUMN IF NOT EXISTS rne_checked_at timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM public_registry_announcements WHERE source = 'rne' OR kind = 'establishment_closure'`,
    )
    await queryRunner.query(`ALTER TABLE public_registry_watch_state DROP COLUMN IF EXISTS rne_checked_at`)
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
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_source_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_source_check CHECK (source IN ('bodacc', 'sirene', 'decp'))
    `)
  }
}
