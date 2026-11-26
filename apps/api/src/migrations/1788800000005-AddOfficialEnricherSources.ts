import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Élargit `contacts_source_check` aux deux enrichisseurs de secours à API
 * officielle (LOT 7 des méta-analyses du 03/08 — décision Louis : APIs
 * officielles, jamais de scraping).
 *
 * Sans cette migration, le premier contact résolu par Hunter ou Lusha ferait
 * échouer son INSERT sur la contrainte, en production, au moment précis où
 * l'utilisateur vient de payer un crédit. C'est exactement le défaut qui avait
 * déjà été trouvé une fois sur `account_vocabulary.kind` : toute valeur qui
 * voyage du code vers la base doit voir sa contrainte élargie AVANT le code qui
 * l'écrit.
 *
 * La liste est réécrite en entier plutôt qu'ajoutée : un CHECK ne se complète
 * pas, il se remplace, et lister l'ensemble rend la valeur autorisée lisible
 * d'un coup d'œil.
 */
export class AddOfficialEnricherSources1788800000005 implements MigrationInterface {
  public name = 'AddOfficialEnricherSources1788800000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact', 'demo', 'hunter', 'lusha'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
