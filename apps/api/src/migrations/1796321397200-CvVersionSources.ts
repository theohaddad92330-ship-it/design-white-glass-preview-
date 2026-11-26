import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Trois sources de génération pour le dossier de compétences (#2187.25-27,
 * épopée #2943) : un besoin (`need_id`, déjà là), un appel d'offres, ou une
 * mission comparable — jamais deux à la fois (contrainte applicative,
 * `generateCvVersionSchema`).
 *
 * `SET NULL` sur les deux, même raison que `need_id` : un appel d'offres ou
 * une mission qui disparaît ne doit pas effacer la trace de ce qu'un client a
 * reçu.
 */
export class CvVersionSources1796321397200 implements MigrationInterface {
  public name = 'CvVersionSources1796321397200'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cv_versions ADD COLUMN IF NOT EXISTS rfp_id uuid REFERENCES rfps(id) ON DELETE SET NULL`,
    )
    await queryRunner.query(
      `ALTER TABLE cv_versions ADD COLUMN IF NOT EXISTS comparable_mission_id uuid REFERENCES missions(id) ON DELETE SET NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cv_versions DROP COLUMN IF EXISTS comparable_mission_id`)
    await queryRunner.query(`ALTER TABLE cv_versions DROP COLUMN IF EXISTS rfp_id`)
  }
}
