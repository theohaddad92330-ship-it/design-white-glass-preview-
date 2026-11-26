import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * SIG-B (11/10/2026) — Élargit `contacts_source_check` à la source `job_posting`.
 *
 * Une offre d'emploi publiée par le compte NOMME parfois son équipe de
 * recrutement. Ce recruteur devient un contact CANDIDAT, prouvé par l'offre
 * (intitulé, URL, date de publication dans `raw_data.jobPosting`) : ni un
 * annuaire (`apollo`), ni un registre (`pappers`), ni un modèle
 * (`ai_generated`). C'est cette distinction qu'on cherche le jour où l'on doit
 * dire d'où vient la ligne.
 *
 * La migration passe AVANT le code qui écrit la valeur (GA-11 / GA-12). Liste
 * réécrite en entier, comme `1796436688517-ContactEnrichmentCoordinates`.
 */
export class JobPostingContactSource1796438093817 implements MigrationInterface {
  public name = 'JobPostingContactSource1796438093817'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact', 'demo', 'hunter', 'lusha', 'import', 'crm', 'meeting', 'kaspr', 'fullenrich', 'job_posting'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
