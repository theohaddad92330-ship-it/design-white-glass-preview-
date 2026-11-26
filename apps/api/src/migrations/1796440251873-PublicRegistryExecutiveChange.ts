import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3921.2 (lot W8, 11/10/2026) — `executive_change` : un changement de dirigeant
 * lu dans BODACC (annonce de modification dont le descriptif nomme
 * l'administration, un gérant ou un administrateur), daté par la parution.
 *
 * GA-11/GA-12 : le CHECK s'élargit AVANT le code qui écrit la valeur.
 *
 * Rattrapage (doctrine « un correctif de collecte RATTRAPE l'existant », ciblé
 * et par SEGMENT) : jusqu'ici, ces annonces étaient rangées sous `modification`
 * sans leur descriptif. Seuls les SIREN déjà lus AVEC une modification repartent
 * de zéro — jamais tout le parc. La relecture se fait au premier passage
 * (`firstPass`), donc elle ne fait sonner aucune alerte sur l'historique.
 */
export class PublicRegistryExecutiveChange1796440251873 implements MigrationInterface {
  public name = 'PublicRegistryExecutiveChange1796440251873'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_kind_check CHECK (kind IN (
        'collective_proceeding', 'creation', 'sale', 'accounts_filing',
        'modification', 'deregistration', 'new_establishment', 'executive_change', 'other'))
    `)
    await queryRunner.query(`
      UPDATE public_registry_watch_state SET bodacc_through = NULL
      WHERE siren IN (SELECT DISTINCT siren FROM public_registry_announcements WHERE kind = 'modification')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE public_registry_announcements SET kind = 'modification' WHERE kind = 'executive_change'`,
    )
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_kind_check CHECK (kind IN (
        'collective_proceeding', 'creation', 'sale', 'accounts_filing',
        'modification', 'deregistration', 'new_establishment', 'other'))
    `)
  }
}
