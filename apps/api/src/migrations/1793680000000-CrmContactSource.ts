import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1995 — Élargit `contacts_source_check` à la source `crm`.
 *
 * Une fiche créée depuis une ligne du CRM connecté n'est ni saisie à la main
 * (`manual`) ni reprise en masse (`import`) : elle vient d'un outil que le
 * client tient à jour. Le jour où une adresse rebondit, c'est cette
 * distinction-là qu'on cherche — `field_provenance` arbitre les CHAMPS, la
 * source dit d'où vient la LIGNE, et rien d'autre ne le porte.
 *
 * La migration passe AVANT le code qui écrit la valeur (GA-11 / GA-12) : sans
 * elle, le premier INSERT échoue en production au moment précis où quelqu'un
 * clique « Créer la fiche » dans une conversation avec Laura.
 *
 * La liste est réécrite en entier plutôt qu'ajoutée : un CHECK ne se complète
 * pas, il se remplace, et lister l'ensemble rend l'autorisé lisible d'un coup
 * d'œil.
 */
export class CrmContactSource1793680000000 implements MigrationInterface {
  public name = 'CrmContactSource1793680000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact', 'demo', 'hunter', 'lusha', 'import', 'crm'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
