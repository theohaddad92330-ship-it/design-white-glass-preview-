import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les compétences RETENUES mises en avant pour le besoin ciblé (#2187.38,
 * épopée #2943).
 *
 * Toujours un sous-ensemble de ce que le profil prouve déjà — jamais une
 * compétence inventée : `highlighted_skills` INTERSECTE les compétences
 * retenues et celles du besoin, elle n'en ajoute aucune.
 *
 * `NOT NULL DEFAULT '[]'` : une version déjà générée avant cette migration
 * n'a simplement rien à mettre en avant, ce n'est pas une donnée manquante.
 */
export class CvVersionHighlightedSkills1796321397100 implements MigrationInterface {
  public name = 'CvVersionHighlightedSkills1796321397100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cv_versions ADD COLUMN IF NOT EXISTS highlighted_skills jsonb NOT NULL DEFAULT '[]'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cv_versions DROP COLUMN IF EXISTS highlighted_skills`)
  }
}
