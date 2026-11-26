import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2777 — Élargit `contacts_source_check` à la source `meeting`.
 *
 * La cascade du compte rendu de rendez-vous (§7.2) rend une personne CITÉE
 * pendant le rendez-vous (`mentionedContacts`) sans pouvoir jamais l'écrire :
 * la sortie `contacts` répondait `blocked` / « il manque : le répertoire de
 * contacts » (`MeetingNotesService.approveInternal`, table
 * `MISSING_CAPABILITY`). Une fiche créée depuis cette cascade n'est ni saisie
 * à la main (`manual`) ni reprise en masse (`import`) ni relue chez un CRM
 * connecté (`crm`) : elle vient d'un NOM prononcé en réunion et retenu par
 * l'utilisateur au moment où il valide le lot — c'est cette distinction-là
 * qu'on cherche le jour où on doit dire d'où vient la ligne.
 *
 * La migration passe AVANT le code qui écrit la valeur (GA-11 / GA-12) :
 * sans elle, le premier INSERT échouerait en production au clic sur
 * « Valider » de la carte « Personnes citées ».
 *
 * La liste est réécrite en entier plutôt qu'ajoutée : un CHECK ne se
 * complète pas, il se remplace — même convention que `1793680000000-
 * CrmContactSource.ts`.
 */
export class MeetingContactSource1796321264660 implements MigrationInterface {
  public name = 'MeetingContactSource1796321264660'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact', 'demo', 'hunter', 'lusha', 'import', 'crm', 'meeting'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
