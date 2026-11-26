import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4802 — GA-11/12 : le CHECK s'élargit AVANT le code qui écrit une valeur neuve.
 *
 * `access_facts.kind` accepte `access_status` : l'état d'accès (référencé / à bâtir / inconnu) qu'un humain
 * pose sur la fiche d'un compte. Les quatre natures d'avant sont inchangées.
 */
export class AccessFactsWidenKindAccessStatus1796584275703 implements MigrationInterface {
  public name = 'AccessFactsWidenKindAccessStatus1796584275703'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE access_facts DROP CONSTRAINT IF EXISTS access_facts_kind_check`)
    await queryRunner.query(`
      ALTER TABLE access_facts
      ADD CONSTRAINT access_facts_kind_check CHECK (kind IN ('lock','mode','cost','path','access_status'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM access_facts WHERE kind = 'access_status'`)
    await queryRunner.query(`ALTER TABLE access_facts DROP CONSTRAINT IF EXISTS access_facts_kind_check`)
    await queryRunner.query(`
      ALTER TABLE access_facts
      ADD CONSTRAINT access_facts_kind_check CHECK (kind IN ('lock','mode','cost','path'))
    `)
  }
}
