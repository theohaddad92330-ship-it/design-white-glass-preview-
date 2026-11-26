import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2160.60 — « Autoriser la recommandation » : la correction humaine qui lève,
 * SUR LA FICHE, un doute d'identité (`homonym_conflict` / `entity_mismatch`
 * — jamais une raison RGPD/opposition/effacement) à la porte d'éligibilité du
 * classement (`contact-eligibility.ts`). ADDITIVE, NULLABLE, sans CHECK : une
 * fiche jamais autorisée lit simplement `NULL`, jamais une autorisation
 * devinée. `recommendation_authorized_reason` porte la raison LEVÉE (pas un
 * commentaire libre) : c'est elle que la porte d'éligibilité compare à la
 * raison qui bloquait CE contact avant d'ignorer l'exclusion.
 */
export class ContactRecommendationAuthorized1796321336533 implements MigrationInterface {
  name = 'ContactRecommendationAuthorized1796321336533'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS recommendation_authorized_at timestamptz;
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS recommendation_authorized_by uuid;
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS recommendation_authorized_reason text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts DROP COLUMN IF EXISTS recommendation_authorized_reason;
      ALTER TABLE contacts DROP COLUMN IF EXISTS recommendation_authorized_by;
      ALTER TABLE contacts DROP COLUMN IF EXISTS recommendation_authorized_at;
    `)
  }
}
