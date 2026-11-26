import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2927 (#2159.54/.55/.70) — « PERSONNEL → ÉQUIPE » : le geste explicite par lequel un utilisateur partage un de ses
 * contacts personnels avec son équipe. La ligne personnelle n'est PAS supprimée (on archive, on ne supprime pas) :
 * `promoted_at` la retire de « Mes contacts personnels », `promoted_contact_id` garde le lien vers la fiche d'équipe
 * qui en est née. Colonnes posées AVANT le code qui les écrit (GA-11/12) ; nullables, donc sans effet sur l'existant.
 */
export class PersonalContactPromotion1796427004017 implements MigrationInterface {
  public name = 'PersonalContactPromotion1796427004017'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE personal_contacts
        ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
        ADD COLUMN IF NOT EXISTS promoted_contact_id uuid
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE personal_contacts
        DROP COLUMN IF EXISTS promoted_contact_id,
        DROP COLUMN IF EXISTS promoted_at
    `)
  }
}
