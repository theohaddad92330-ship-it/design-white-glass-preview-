import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4196 (épopée #4191, lot L5) — la contrainte SQL s'élargit AVANT le code qui
 * écrit (GA-11/12). `en_mission` (#2186.5) existait dans
 * `consultantAvailabilitySchema` mais jamais dans `consultants_availability_check`
 * (posée par `1788013450112-Consultants`) : personne ne l'écrivait encore. L5 la
 * pose à l'affectation (`consultant-engagement.service.ts`) et le semis démo
 * aussi — la base les refusait.
 *
 * `down` ramène `en_mission` à `indisponible` (l'ancien libellé « En mission »)
 * avant de resserrer, sinon la contrainte ne se reposerait pas.
 */
export class ConsultantAvailabilityEnMission1796531408463 implements MigrationInterface {
  name = 'ConsultantAvailabilityEnMission1796531408463'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_availability_check;
      ALTER TABLE consultants ADD CONSTRAINT consultants_availability_check
        CHECK (availability IN ('immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible', 'inconnu', 'en_mission'));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE consultants SET availability = 'indisponible' WHERE availability = 'en_mission';
      ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_availability_check;
      ALTER TABLE consultants ADD CONSTRAINT consultants_availability_check
        CHECK (availability IN ('immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible', 'inconnu'));
    `)
  }
}
