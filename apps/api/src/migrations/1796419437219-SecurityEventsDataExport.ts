import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2879 (#2442.14, lot X17 du 02/10) — GA-11/12 : le CHECK de
 * `security_events.kind` s'élargit AVANT le code qui écrit la valeur neuve
 * `data_export`.
 *
 * `data_export` = une sortie de données AUTORISÉE (route `@DataExit()` passée
 * par `WorkspacePermissionGuard`). Le compteur ne dit pas « combien » une
 * sortie contenait — il compte les sorties d'un même espace, ce que l'alerte
 * « export massif » lit PAR ESPACE. `path` = la ROUTE seule, `status_code` =
 * 200, `workspace_id` = l'espace, aucune personne ni contenu.
 */
export class SecurityEventsDataExport1796419437219 implements MigrationInterface {
  public name = 'SecurityEventsDataExport1796419437219'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_kind_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied', 'leak_detected', 'cross_tenant_suspected', 'injection_suspected', 'permission_escalated', 'data_export'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM security_events WHERE kind = 'data_export'`)
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_kind_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied', 'leak_detected', 'cross_tenant_suspected', 'injection_suspected', 'permission_escalated'))
    `)
  }
}
