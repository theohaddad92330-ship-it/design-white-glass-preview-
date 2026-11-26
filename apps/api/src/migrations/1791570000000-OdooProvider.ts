import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Odoo rejoint les fournisseurs CRM — la CONTRAINTE d'abord, le code ensuite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION EXISTE SEULE, AVANT TOUT CODE ODOO
 * ─────────────────────────────────────────────────────────────────────────
 * `sync_links.provider` porte un CHECK fermé sur cinq valeurs. Le jour où le
 * service Odoo écrit sa première ligne de liaison, Postgres la refuse — et le
 * défaut ne se voit pas au démarrage : il se voit au premier import réel d'un
 * client, c'est-à-dire au pire moment.
 *
 * C'est la règle GA-11 / GA-12 du dépôt : **une valeur qui voyage du code vers
 * la base voit sa contrainte SQL élargie AVANT le code qui l'écrit.** Elle est
 * ici dans sa propre migration, donc déployable seule et en avance.
 *
 * ⚠️ `crm_connections.provider` est un TEXT NU, sans CHECK — rien à élargir de
 * ce côté. Ce n'est pas un oubli de cette migration : ajouter une contrainte
 * là-bas maintenant transformerait une migration d'élargissement en migration
 * de resserrement, qui peut échouer sur une ligne existante. Le typage TS de
 * `CrmConnectionEntity` reste la seule barrière à cet endroit, et il est
 * honnête de le dire plutôt que de laisser croire à une garde SQL.
 *
 * `sync_runs.provider` n'a pas de CHECK non plus (vérifié le 01/09/2026).
 */
export class OdooProvider1791570000000 implements MigrationInterface {
  name = 'OdooProvider1791570000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `IF EXISTS` : la contrainte porte un nom explicite depuis sa création,
    // mais une base restaurée d'un dump ancien peut ne pas l'avoir.
    await queryRunner.query(`ALTER TABLE sync_links DROP CONSTRAINT IF EXISTS sync_links_provider_check`)
    await queryRunner.query(`
      ALTER TABLE sync_links ADD CONSTRAINT sync_links_provider_check CHECK (
        provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'csv')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * ⚠️ Le retour arrière ÉCHOUE si une liaison Odoo existe déjà, et c'est
     * voulu : resserrer la contrainte sur des lignes qui la violent
     * détruirait la trace d'un import réel. Postgres refusera l'ALTER avec
     * un message qui nomme la ligne fautive — un rouge lisible vaut mieux
     * qu'un `DELETE` silencieux glissé dans un `down()`.
     */
    await queryRunner.query(`ALTER TABLE sync_links DROP CONSTRAINT IF EXISTS sync_links_provider_check`)
    await queryRunner.query(`
      ALTER TABLE sync_links ADD CONSTRAINT sync_links_provider_check CHECK (
        provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio', 'csv')
      )
    `)
  }
}
