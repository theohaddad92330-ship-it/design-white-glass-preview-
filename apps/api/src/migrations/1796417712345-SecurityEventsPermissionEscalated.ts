import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2879 (#2442.14) — GA-11/12 : le CHECK de `security_events.kind`
 * s'élargit AVANT le code qui écrit la valeur neuve `permission_escalated`.
 *
 * `permission_escalated` = un membre AUTHENTIFIÉ de l'espace a tenté un geste
 * que son rôle ne permet pas (`InsufficientRoleException`). Distinct de
 * `authorization_denied` (jeton absent/invalide, autre refus) : sans cette
 * distinction, un 403 « rôle insuffisant » se confondait avec un 401.
 * `path` = la ROUTE seule, `status_code` = 403, aucune donnée personnelle.
 */
export class SecurityEventsPermissionEscalated1796417712345 implements MigrationInterface {
  public name = 'SecurityEventsPermissionEscalated1796417712345'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_kind_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied', 'leak_detected', 'cross_tenant_suspected', 'injection_suspected', 'permission_escalated'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM security_events WHERE kind = 'permission_escalated'`)
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_kind_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied', 'leak_detected', 'cross_tenant_suspected', 'injection_suspected'))
    `)
  }
}
