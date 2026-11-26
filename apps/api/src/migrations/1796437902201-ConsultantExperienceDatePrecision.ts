import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3935 (lot P03, décision Louis 09/10) — UNE DATE D'EXPÉRIENCE GARDE SA PRÉCISION.
 *
 * Un CV écrit souvent « 2019 – 2021 » : l'ANNÉE seule. Le lot M07 la laissait
 * `null` (la colonne `date` ne sait pas dire « 2019 » sans affirmer un mois).
 * Tranché : on garde l'année, et on dit qu'on n'a QUE l'année — `date_debut`
 * reçoit le 1er janvier par convention de stockage, `date_debut_precision`
 * vaut `year` ; l'écran affiche « 2019 », jamais « 2019-01 ». Même chose au
 * mois (`month`, affichée « 2019-03 »).
 *
 * `NULL` = aucune précision portée : la date se lit telle qu'elle est stockée
 * (saisie à la main, ligne antérieure à ce lot). Aucune ligne existante n'est
 * réécrite ici — le rattrapage passe par `CV_COMPLETENESS_FIX_AT`, ciblé,
 * jamais au déploiement.
 *
 * Posée AVANT le code qui l'écrit (GA-11/GA-12) ; CHECK NOMMÉS (GA-177),
 * couverts par `EXPERIENCE_DATE_PRECISIONS` (`@bellum/contracts`).
 */
export class ConsultantExperienceDatePrecision1796437902201 implements MigrationInterface {
  public name = 'ConsultantExperienceDatePrecision1796437902201'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultant_experiences
        ADD COLUMN IF NOT EXISTS date_debut_precision text,
        ADD COLUMN IF NOT EXISTS date_fin_precision text
    `)
    await queryRunner.query(`
      ALTER TABLE consultant_experiences DROP CONSTRAINT IF EXISTS consultant_experiences_date_debut_precision_check
    `)
    await queryRunner.query(`
      ALTER TABLE consultant_experiences
        ADD CONSTRAINT consultant_experiences_date_debut_precision_check
        CHECK (date_debut_precision IS NULL OR date_debut_precision IN ('year', 'month'))
    `)
    await queryRunner.query(`
      ALTER TABLE consultant_experiences DROP CONSTRAINT IF EXISTS consultant_experiences_date_fin_precision_check
    `)
    await queryRunner.query(`
      ALTER TABLE consultant_experiences
        ADD CONSTRAINT consultant_experiences_date_fin_precision_check
        CHECK (date_fin_precision IS NULL OR date_fin_precision IN ('year', 'month'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultant_experiences
        DROP COLUMN IF EXISTS date_debut_precision,
        DROP COLUMN IF EXISTS date_fin_precision
    `)
  }
}
