import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `finance:read:own` — le commercial voit SON chiffre (D1 · 26/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONTRAINTE AVANT LE CODE QUI ÉCRIT LA VALEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * `workspace_member_permissions.permission` porte un `CHECK` en liste fermée.
 * Ajouter la valeur à l'énumération TypeScript sans élargir la contrainte
 * produirait un 500 au premier responsable qui l'accorde à un membre — la leçon
 * `account_vocabulary.kind`, et celle du 22/08 où `finance:write` était
 * accordable à personne (GA-12 l'a trouvée).
 *
 * La migration passe donc AVANT, et la garde GA-12 compare les deux listes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'accorde rien. La permission entre dans la matrice de rôles côté code
 * (`sales` et `sales_ops`), ce qui est un choix de produit versionné avec lui ;
 * les accords PAR MEMBRE restent la décision d'un responsable, et cette table
 * ne porte que ceux-là.
 */
export class FinanceReadOwnPermission1790160000001 implements MigrationInterface {
  name = 'FinanceReadOwnPermission1790160000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspace_member_permissions DROP CONSTRAINT IF EXISTS workspace_member_permissions_check`,
    )
    await queryRunner.query(`
      ALTER TABLE workspace_member_permissions ADD CONSTRAINT workspace_member_permissions_check CHECK (
        permission IN (
          'analysis:run', 'contacts:enrich', 'data:export', 'messages:send',
          'records:write', 'team:manage', 'integrations:manage', 'billing:manage', 'finance:read',
          'finance:write', 'finance:read:own'
        )
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On RETIRE les accords de la valeur qu'on s'apprête à interdire : la
    // contrainte refuserait de se poser sur une table qui en porte.
    await queryRunner.query(`DELETE FROM workspace_member_permissions WHERE permission = 'finance:read:own'`)
    await queryRunner.query(
      `ALTER TABLE workspace_member_permissions DROP CONSTRAINT IF EXISTS workspace_member_permissions_check`,
    )
    await queryRunner.query(`
      ALTER TABLE workspace_member_permissions ADD CONSTRAINT workspace_member_permissions_check CHECK (
        permission IN (
          'analysis:run', 'contacts:enrich', 'data:export', 'messages:send',
          'records:write', 'team:manage', 'integrations:manage', 'billing:manage', 'finance:read',
          'finance:write'
        )
      )
    `)
  }
}
