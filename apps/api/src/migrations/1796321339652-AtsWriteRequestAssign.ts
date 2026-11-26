import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2864 — reste du lot précédent : la délégation (`assigned_to`) ne couvrait
 * que `approval_requests`, puis `outbound_write_requests` (migration
 * 1796321339621). Même colonne, même règle de lecture — « ce qu'on m'a
 * confié » — posée ici pour `ats_write_requests` (les écritures ERP en
 * attente d'un responsable).
 *
 * ADDITIVE et NULLABLE : une demande existante lit « non déléguée ». Pas de
 * clé étrangère, même raison que les deux migrations précédentes :
 * l'appartenance à l'ESPACE de la demande se vérifie au moment de la
 * délégation (`AtsWriteService.assign`), jamais par une contrainte sur un
 * compte qui a pu quitter l'espace.
 */
export class AtsWriteRequestAssign1796321339652 implements MigrationInterface {
  name = 'AtsWriteRequestAssign1796321339652'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ats_write_requests ADD COLUMN IF NOT EXISTS assigned_to uuid`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ats_write_requests_workspace_assignee_idx
      ON ats_write_requests (workspace_id, assigned_to)
      WHERE state = 'pending' AND assigned_to IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ats_write_requests_workspace_assignee_idx`)
    await queryRunner.query(`ALTER TABLE ats_write_requests DROP COLUMN IF EXISTS assigned_to`)
  }
}
