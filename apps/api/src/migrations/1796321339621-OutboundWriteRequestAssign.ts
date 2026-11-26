import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2864 — reste du lot précédent : la délégation (`assigned_to`) ne couvrait
 * que `approval_requests`. Même colonne, même règle de lecture — « ce qu'on
 * m'a confié » — posée ici pour `outbound_write_requests` (les écritures CRM
 * en attente, BEL-INT-603).
 *
 * ADDITIVE et NULLABLE : une demande existante lit « non déléguée », son
 * comportement d'avant. Pas de clé étrangère, même raison que
 * `ApprovalRequestAssignAndSnooze` (migration 1796001543887) : l'appartenance
 * à l'ESPACE de la demande est la vraie règle, vérifiée au moment de la
 * délégation — jamais la simple existence d'un compte.
 */
export class OutboundWriteRequestAssign1796321339621 implements MigrationInterface {
  name = 'OutboundWriteRequestAssign1796321339621'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbound_write_requests ADD COLUMN IF NOT EXISTS assigned_to uuid`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outbound_write_requests_workspace_assignee_idx
      ON outbound_write_requests (workspace_id, assigned_to)
      WHERE state = 'pending' AND assigned_to IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS outbound_write_requests_workspace_assignee_idx`)
    await queryRunner.query(`ALTER TABLE outbound_write_requests DROP COLUMN IF EXISTS assigned_to`)
  }
}
