import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2159.62 — LA DERNIÈRE VÉRIFICATION D'EMPLOI D'UN CONTACT.
 *
 * `contacts` porte déjà QUAND une tentative d'enrichissement a eu lieu
 * (`last_enrichment_at`) et son ISSUE (`last_enrichment_result`), mais rien ne
 * dit quand l'EMPLOI (titre, entité) d'une personne a été RECONFIRMÉ — ni par
 * un fournisseur qui la retrouve à la même organisation, ni par un humain qui
 * corrige `title`/`entity` à la main sur la fiche.
 *
 * Deux sources écrivent cette date, jamais une troisième :
 *  · l'enrichissement, quand `last_enrichment_result` devient `'matched'`
 *    (`ContactsService.enrichContact`) — un `'no_new_data'` ou
 *    `'newer_data_exists'` ne reconfirme RIEN sur l'employeur ;
 *  · la correction humaine, quand `title` OU `entity` est effectivement
 *    ACCEPTÉ par l'arbitre de provenance (`RecordEditService.patchContact`) —
 *    jamais sur un champ REJETÉ (une correction humaine gagne toujours, mais
 *    une correction refusée n'a rien vérifié).
 *
 * NULL = jamais vérifié — jamais une date devinée à la création de la fiche.
 */
export class ContactEmploymentVerifiedAt1796349810000 implements MigrationInterface {
  name = 'ContactEmploymentVerifiedAt1796349810000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS employment_verified_at timestamptz NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS employment_verified_at`)
  }
}
