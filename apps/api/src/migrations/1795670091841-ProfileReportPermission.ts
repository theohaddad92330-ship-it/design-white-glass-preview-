import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2018.7 — `profile:report` : SIGNALER une information d'entreprise fausse
 * sans le droit de l'écraser.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE, ET IL N'EST PAS NÉGOCIABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * **La contrainte SQL s'élargit AVANT le code qui écrira la valeur** (GA-11,
 * GA-12). Sans cette migration, `profile:report` existerait en TypeScript
 * (`workspacePermissionValues`) et la base la REFUSERAIT dès qu'un
 * administrateur tenterait d'accorder ce droit en propre à un membre — la
 * violation de contrainte se lèverait au moment de l'accord, souvent avalée
 * dans un `try/catch`, donc invisible autrement qu'en message d'erreur
 * générique.
 *
 * ⚠️ La liste repart de la DERNIÈRE déclaration (`CrmReadPermission`) et n'en
 * retire AUCUNE valeur : une contrainte CHECK ne rétrécit jamais (GA-11).
 * Côté TypeScript, la valeur est ajoutée EN FIN d'énumération (GA-08).
 */
export class ProfileReportPermission1795670091841 implements MigrationInterface {
  name = 'ProfileReportPermission1795670091841'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspace_member_permissions DROP CONSTRAINT IF EXISTS workspace_member_permissions_check`,
    )
    await queryRunner.query(`
      ALTER TABLE workspace_member_permissions ADD CONSTRAINT workspace_member_permissions_check CHECK (
        permission IN (
          'analysis:run', 'contacts:enrich', 'data:export', 'messages:send',
          'records:write', 'team:manage', 'integrations:manage', 'billing:manage', 'finance:read',
          'finance:write', 'finance:read:own', 'crm:read', 'profile:report'
        )
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On RETIRE les accords de la valeur qu'on s'apprête à interdire : la
    // contrainte refuserait de se poser sur une table qui en porte.
    await queryRunner.query(`DELETE FROM workspace_member_permissions WHERE permission = 'profile:report'`)
    await queryRunner.query(
      `ALTER TABLE workspace_member_permissions DROP CONSTRAINT IF EXISTS workspace_member_permissions_check`,
    )
    await queryRunner.query(`
      ALTER TABLE workspace_member_permissions ADD CONSTRAINT workspace_member_permissions_check CHECK (
        permission IN (
          'analysis:run', 'contacts:enrich', 'data:export', 'messages:send',
          'records:write', 'team:manage', 'integrations:manage', 'billing:manage', 'finance:read',
          'finance:write', 'finance:read:own', 'crm:read'
        )
      )
    `)
  }
}
