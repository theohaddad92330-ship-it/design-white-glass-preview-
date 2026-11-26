import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2039.6 (épopée #2880, tranché sans Louis) — « simple volonté de
 * développement » : les expertises que l'ESN a déclarées (`expertise_areas`)
 * mais pour lesquelles elle n'a ENCORE aucune preuve concrète (ni référence
 * client, ni mission, ni témoignage). Une colonne ADDITIVE, `text[]` par
 * défaut vide, même famille que `case_study_results`/`client_testimonials`
 * (migration `1794010756001`) : le questionnaire ne bloque jamais, une
 * question passée reste un tableau vide, jamais devinée. Absente de
 * `TEMPS1_REQUIRED_KEYS` : la porte de complétion serveur ne bouge pas.
 *
 * Élargie AVANT le code qui l'écrit (GA-11/GA-12).
 */
export class ExpertiseNoConcreteProof1796321384417 implements MigrationInterface {
  name = 'ExpertiseNoConcreteProof1796321384417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS expertise_no_concrete_proof text[] DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS expertise_no_concrete_proof;
    `)
  }
}
