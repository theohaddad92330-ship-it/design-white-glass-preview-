import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ce qui empêche réellement d'avancer — #2055 (lot G4).
 *
 * `main_sales_pain` ne portait QU'UN frein, choisi dans neuf. Quatre colonnes
 * ADDITIVES : les freins qui pèsent (texte libre compris, #2055.1-.14) et les
 * trois relances qui séparent le symptôme du goulot (#2055.15).
 *
 * `sales_freins` est un `text[]` avec défaut `'{}'`, comme les autres réponses
 * à choix multiple du profil ; les trois relances sont NULLABLE. Aucun CHECK :
 * une question passée reste vide/NULL, et un frein non renseigné n'est PAS un
 * frein absent — c'est la lecture (`readSalesFreins`, contracts) qui tient la
 * distinction, jamais une valeur de remplissage écrite en base.
 */
export class FreinsCommerciaux1794024403057 implements MigrationInterface {
  name = 'FreinsCommerciaux1794024403057'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS sales_freins text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS frein_attempted text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS frein_stopped text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS frein_stopped_reason text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS sales_freins;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS frein_attempted;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS frein_stopped;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS frein_stopped_reason;
    `)
  }
}
