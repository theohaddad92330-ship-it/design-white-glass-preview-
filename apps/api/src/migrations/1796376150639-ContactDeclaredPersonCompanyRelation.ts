import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #219.8 (LAU-FINAL-219, #3231) — la relation PERSONNE↔ENTREPRISE, quand elle
 * est DÉCLARÉE (correction du commercial, champ CRM dédié — jamais devinée
 * depuis un `employmentHistory` Apollo), pilote désormais la prudence du
 * MESSAGE (`relationship_playbook.message_directive_block`,
 * `bellum_outreach.build_user_prompt`) : ne jamais écrire comme si un
 * ex-salarié, un ex-prestataire, ou une personne seulement PRÉSENTÉE comme
 * consultante, était encore en poste aujourd'hui.
 *
 * ⚠️ LA CONTRAINTE EST POSÉE AVANT LE CODE QUI ÉCRIT LA VALEUR (GA-11 / GA-12).
 *
 * ⚠️ NULLABLE, ET C'EST LA SEULE ISSUE HONNÊTE : aucune source aujourd'hui ne
 * porte cette donnée (Apollo/SalesQL ne rendent que `title`/`organization`/
 * `current`). `NULL` reste `unknown_relationship` à la lecture
 * (`classify_person_company_relation`) — le vocabulaire existe pour que le
 * jour où une source la déclare (correction du commercial, champ CRM dédié),
 * elle ait un nom où atterrir, pas pour être backfillée par une hypothèse.
 *
 * Les treize valeurs reprennent exactement `PersonCompanyRelation`
 * (`apps/ia/app/services/person_company_relation.py`) — un seul vocabulaire,
 * GA-26.
 */
export class ContactDeclaredPersonCompanyRelation1796376150639 implements MigrationInterface {
  public name = 'ContactDeclaredPersonCompanyRelation1796376150639'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS declared_person_company_relation text
    `)

    await queryRunner.query(`
      ALTER TABLE contacts
        DROP CONSTRAINT IF EXISTS contacts_declared_person_company_relation_check
    `)

    await queryRunner.query(`
      ALTER TABLE contacts
        ADD CONSTRAINT contacts_declared_person_company_relation_check
        CHECK (declared_person_company_relation IS NULL OR declared_person_company_relation IN (
          'employee_current', 'employee_former', 'contractor_current', 'contractor_historical',
          'freelancer', 'manager', 'buyer', 'technical_reviewer', 'sponsor', 'user',
          'recruiter', 'consultant_presented', 'unknown_relationship'
        ))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
