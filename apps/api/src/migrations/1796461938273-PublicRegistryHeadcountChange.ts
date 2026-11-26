import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3921 (décision Louis 13/10/2026, lot S7) — `headcount_change` : une tranche
 * d'effectif INSEE différente entre deux relevés `sirene_snapshots` MESURÉS.
 *
 * GA-11/GA-12 : le CHECK s'élargit AVANT le code qui écrit la valeur.
 *
 * Aucun rattrapage : c'est une valeur NEUVE, aucune ligne existante ne porte
 * déjà ce genre à requalifier (contrairement à `executive_change`, qui
 * reclassait des `modification` déjà écrites).
 */
export class PublicRegistryHeadcountChange1796461938273 implements MigrationInterface {
  public name = 'PublicRegistryHeadcountChange1796461938273'

  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM public_registry_announcements WHERE kind = 'headcount_change'`)
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
  }
}
