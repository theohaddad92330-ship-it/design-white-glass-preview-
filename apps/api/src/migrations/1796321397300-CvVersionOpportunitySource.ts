import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La quatrième source de génération : une opportunité (#2187.25, épopée
 * #2943) — un besoin commercial pas encore matérialisé en rôle staffé
 * (`project_needs`). `SET NULL`, même raison que `need_id`/`rfp_id` : une
 * opportunité qui disparaît ne doit pas effacer la trace de ce qu'un client a
 * reçu.
 */
export class CvVersionOpportunitySource1796321397300 implements MigrationInterface {
  public name = 'CvVersionOpportunitySource1796321397300'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cv_versions ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cv_versions DROP COLUMN IF EXISTS opportunity_id`)
  }
}
