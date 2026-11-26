import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4692 — `ats_write_requests.kind` accepte `log_call` (compte rendu d'appel dans la fiche contact Boond).
 * La contrainte est élargie AVANT le code qui écrit la valeur (GA-11, GA-12). Ajout seul : aucune ligne existante ne bouge.
 */
export class AtsWriteRequestsLogCall1796610100000 implements MigrationInterface {
  name = 'AtsWriteRequestsLogCall1796610100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ats_write_requests DROP CONSTRAINT IF EXISTS ats_write_requests_kind_check`)
    await queryRunner.query(`
      ALTER TABLE ats_write_requests ADD CONSTRAINT ats_write_requests_kind_check CHECK (
        kind IN ('create_mission', 'update_tjm', 'update_need_status', 'log_call')
      )
    `)
  }

  public async down(): Promise<void> {
    // Élargissement seul : des lignes `log_call` peuvent exister, resserrer la contrainte échouerait.
  }
}
