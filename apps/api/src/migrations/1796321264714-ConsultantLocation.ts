import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2183.21 — la ville du bloc `identity` (`nom complet, e-mail, téléphone,
 * ville`) a désormais un extracteur (`readLocationFromIdentity`,
 * `@bellum/contracts`), mais aucune colonne pour la recevoir : `consultants`
 * porte `email`/`phone` depuis le lot 19 (#1789), jamais `location`.
 *
 * NULLABLE, additive : une fiche déjà en base n'a pas de ville connue, et
 * « non renseigné » est une réponse honnête, jamais une valeur devinée.
 */
export class ConsultantLocation1796321264714 implements MigrationInterface {
  name = 'ConsultantLocation1796321264714'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants ADD COLUMN IF NOT EXISTS location text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS location`)
  }
}
