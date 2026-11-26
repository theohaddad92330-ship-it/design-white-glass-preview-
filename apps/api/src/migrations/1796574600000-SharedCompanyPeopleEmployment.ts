import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4286.15.b — épopée « Base commune » (décision Louis 19/10/2026, #4268) : les ANCIENS se
 * partagent aussi, mais un ancien n'est JAMAIS présenté comme actuel.
 *
 * ADDITIVE. `shared_company_people` portait déjà `last_seen_at` (posé à chaque observation par
 * `upsertSharedCompanyPeople`) ; elle reçoit l'état de la personne chez la société :
 *
 *  · `employment_state` — `current` | `former` (vocabulaire fermé, `SHARED_EMPLOYMENT_STATES`),
 *    `current` par défaut pour les lignes déjà versées : c'est ce qu'elles affirmaient. « Inconnu »
 *    ne se stocke pas, il se LIT (`sharedEmploymentReading`) : un fait non revu depuis
 *    `SHARED_FACT_STALE_AFTER_DAYS` redevient inconnu — archivé, jamais supprimé (seul c67 supprime) ;
 *  · `left_at` — la date de départ quand on la connaît, jamais sur une personne actuelle (CHECK).
 *
 * Posé AVANT le code qui l'écrit (GA-11 / GA-12). Contraintes NOMMÉES (GA-177). Aucune colonne
 * d'espace, de note, de statut commercial ni de coût (GA-43).
 */
export class SharedCompanyPeopleEmployment1796574600000 implements MigrationInterface {
  public name = 'SharedCompanyPeopleEmployment1796574600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shared_company_people
        ADD COLUMN IF NOT EXISTS employment_state text NOT NULL DEFAULT 'current',
        ADD COLUMN IF NOT EXISTS left_at date NULL
    `)
    await queryRunner.query(
      `ALTER TABLE shared_company_people DROP CONSTRAINT IF EXISTS shared_company_people_employment_state_check`,
    )
    await queryRunner.query(`
      ALTER TABLE shared_company_people
        ADD CONSTRAINT shared_company_people_employment_state_check CHECK (employment_state IN ('current', 'former'))
    `)
    await queryRunner.query(
      `ALTER TABLE shared_company_people DROP CONSTRAINT IF EXISTS shared_company_people_left_at_check`,
    )
    await queryRunner.query(`
      ALTER TABLE shared_company_people
        ADD CONSTRAINT shared_company_people_left_at_check CHECK (left_at IS NULL OR employment_state = 'former')
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
