import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2183.26 extrait déjà le bloc `education` (formations/diplômes) d'un CV, et
 * l'écran de revue l'affiche pendant l'import — mais rien ne le PERSISTE
 * jusqu'à la fiche (#2784, recette écran du 27/09/2026 : « Formations » y
 * reste « Non renseigné » même sur une fiche née d'un CV déposé, alors que
 * `location` — même agrégat, même lot d'origine — l'est déjà).
 *
 * NULLABLE, additive : une fiche déjà en base n'a pas de formations connues,
 * et « non renseigné » est une réponse honnête, jamais une valeur devinée.
 */
export class ConsultantEducation20260927195301 implements MigrationInterface {
  name = 'ConsultantEducation20260927195301'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants ADD COLUMN IF NOT EXISTS education text[]
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS education`)
  }
}
