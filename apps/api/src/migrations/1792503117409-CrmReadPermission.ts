import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1791.2 — `crm:read` : interroger un outil connecté DEPUIS LA CONVERSATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PERMISSION DE PLUS, ET PAS `data:export`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le premier jet reprenait `data:export`, et ça marchait : tous les rôles qui
 * travaillent la portent. Mais « sortir des données du produit » et « demander
 * si ce compte est déjà chez nous » ne sont pas le même geste, et les lier rend
 * l'un infermable sans l'autre — le jour où l'on veut couper la lecture CRM à
 * quelqu'un, on lui coupe aussi l'export, et inversement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE, ET IL N'EST PAS NÉGOCIABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * **La contrainte SQL s'élargit AVANT le code qui écrira la valeur** (GA-11,
 * GA-12). Sans cette migration, `crm:read` existerait en TypeScript et la base
 * la REFUSERAIT : la violation de contrainte se lève au moment d'accorder la
 * permission à quelqu'un, souvent avalée dans un `try/catch`, donc invisible
 * autrement qu'en message d'erreur générique.
 *
 * ⚠️ La liste repart de la DERNIÈRE déclaration (`FinanceReadOwnPermission`) et
 * n'en retire AUCUNE valeur : une contrainte CHECK ne rétrécit jamais (GA-11).
 * Côté TypeScript, la valeur est ajoutée EN FIN d'énumération (GA-08) et donnée
 * à tous les rôles qui portaient `data:export` — personne ne perd un accès.
 */
export class CrmReadPermission1792503117409 implements MigrationInterface {
  name = 'CrmReadPermission1792503117409'

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On RETIRE les accords de la valeur qu'on s'apprête à interdire : la
    // contrainte refuserait de se poser sur une table qui en porte.
    await queryRunner.query(`DELETE FROM workspace_member_permissions WHERE permission = 'crm:read'`)
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
}
