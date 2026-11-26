import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Qualification BTMMP d'un besoin (annexe méthodo p21 « Qualification BTMMP et
 * découverte »).
 *
 * « Un besoin n'est qualifié que si Bellum comprend le budget, timing, mission,
 * management, process et prochaine étape. » Cette colonne porte les six axes ;
 * la complétude déterministe (`btmmpCompleteness`) dit si le besoin est qualifié.
 * Additive/nullable : NULL = besoin non encore qualifié, comportement historique.
 */
export class OpportunityBtmmp1788026719004 implements MigrationInterface {
  public name = 'OpportunityBtmmp1788026719004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS btmmp jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS btmmp`)
  }
}
