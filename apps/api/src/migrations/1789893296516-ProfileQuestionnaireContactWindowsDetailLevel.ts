import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2058.2 / #2058.10 — les DEUX derniers points qui tenaient #2058 ouverte :
 * les moments acceptés pour solliciter la personne (plages horaires, jours,
 * moments à éviter), et le niveau de détail attendu de ses réponses (court et
 * dense, ou développé).
 *
 * Additive et idempotente, comme `ProfileQuestionnaire1784819567318` : aucune
 * colonne existante n'est touchée, aucune valeur n'est écrite. Un profil qui
 * n'a pas répondu à ces deux questions reste exactement ce qu'il était.
 *
 * Une préférence DÉCLARÉE, jamais une règle d'envoi : cette migration n'ajoute
 * aucun mécanisme de programmation, seulement les deux colonnes de réponse.
 */
export class ProfileQuestionnaireContactWindowsDetailLevel1789893296516 implements MigrationInterface {
  name = 'ProfileQuestionnaireContactWindowsDetailLevel1789893296516'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS contact_windows text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS detail_level text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS contact_windows;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS detail_level;
    `)
  }
}
