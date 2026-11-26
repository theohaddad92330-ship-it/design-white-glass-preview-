import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2074.16 — GA-11/12 : la contrainte SQL s'élargit AVANT le code qui écrit.
 * « Valider » un mouvement d'audit (`ProfileContextService.recordAuditMoveDecision`)
 * pose une tâche `source = 'audit_move'` (`task.ts::TASK_SOURCES`) — pas un
 * action_plan_item : `action_plan_items.account_id` est NOT NULL et un mouvement
 * d'audit ne porte aucun compte.
 *
 * L'index unique PARTIEL est l'idempotence : re-valider le même mouvement ne
 * double pas la tâche. Clé = (espace, propriétaire, source, `source_label_key`
 * = `<ruleId>:<cible>`), seulement pour `audit_move` — les autres sources
 * gardent leur liberté (un humain peut taper deux fois la même tâche).
 * Additive : aucune ligne existante ne porte `audit_move`, l'index se pose à vide.
 */
export class TaskSourceAuditMove1796900103000 implements MigrationInterface {
  public name = 'TaskSourceAuditMove1796900103000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check`)
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT tasks_source_check
      CHECK (source IN ('manual', 'lead_conversion', 'action_os_approval', 'plan_callback', 'audit_move'))
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tasks_audit_move_once_idx
      ON tasks (workspace_id, owner_id, source, source_label_key)
      WHERE source = 'audit_move'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS tasks_audit_move_once_idx`)
    // Les lignes `audit_move` redeviennent `manual` : la contrainte d'avant les connaît.
    await queryRunner.query(`UPDATE tasks SET source = 'manual' WHERE source = 'audit_move'`)
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check`)
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT tasks_source_check
      CHECK (source IN ('manual', 'lead_conversion', 'action_os_approval', 'plan_callback'))
    `)
  }
}
