import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * D'où vient un compte.
 *
 * Le navigateur pose déjà `suggestionId: "discover:<siren>"` et l'envoie dans
 * `POST /analysis/start` ; le contrat dit même qu'il sert « à tracer l'origine
 * du run ». Aucune colonne ne le recevait : `grep suggestion_id apps/api` ne
 * rendait rien. Le jeton était émis puis jeté.
 *
 * C'est précisément la donnée dont le bloc « ce que Bellum a contribué »
 * (tome 1 §12) a besoin pour écrire « 3 missions signées sur des comptes ouverts
 * via Découvrir » — la seule forme d'attribution honnête, parce qu'elle est
 * VÉRIFIABLE et qu'elle n'affirme aucune causalité.
 *
 * NULL est l'état des comptes antérieurs, et il le reste : leur attribuer une
 * origine rétroactivement inventerait une histoire. Le compteur les exclut et
 * DIT combien il en exclut.
 */
export class AccountOrigin1789993128471 implements MigrationInterface {
  name = 'AccountOrigin1789993128471'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS origin TEXT`)
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_origin_check`)
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_origin_check
        CHECK (origin IS NULL OR origin IN ('discover','search','import','crm','manual'))
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS accounts_origin_idx ON accounts (workspace_id, origin)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS accounts_origin_idx`)
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_origin_check`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS origin`)
  }
}
