import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `consultants.years_experience` — les années d'expérience, SAISIES sur la
 * personne (écran Vivier, PDF-22 §01, décision de Louis du 31/08/2026).
 *
 * Le tiroir « Plus de filtres » promettait ce critère depuis le socle, sans
 * qu'aucun champ ne le porte : `consultant_skills.years` ne mesure
 * l'ancienneté que sur UNE compétence, jamais sur la personne — un agrégat
 * improvisé (le plus grand `years` d'une compétence) mesurerait autre chose
 * que ce que le libellé promet. Voir `consultantSchema.years_experience`
 * (`packages/contracts`) pour la décision complète.
 *
 * `integer` nullable, SANS `DEFAULT 0` : `null` pour toute fiche existante —
 * un défaut à zéro laisserait croire que chaque profil du vivier a été
 * évalué « tout juste diplômé », alors que la vérité est « jamais demandé ».
 * `0` reste par ailleurs une réponse VALIDE quand quelqu'un la saisit
 * explicitement (voir `consultantSchema.years_experience`).
 */
export class ConsultantYearsExperience1791000000002 implements MigrationInterface {
  public name = 'ConsultantYearsExperience1791000000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS years_experience integer`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS years_experience`)
  }
}
