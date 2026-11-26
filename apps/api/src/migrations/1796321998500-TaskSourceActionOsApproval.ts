import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2946/#2105.9 — GA-11/12 : la contrainte SQL s'élargit AVANT le code qui
 * écrit. `WorkflowRunnerService.requestApproval` va poser des tâches
 * `source = 'action_os_approval'` (le pont Action OS → Tâche, voir
 * `task.ts::TASK_SOURCES`) ; sans cette migration l'écriture violerait
 * `tasks_source_check` (posée par `TaskSourceAndExpectedResult1796001512041`).
 */
export class TaskSourceActionOsApproval1796321998500 implements MigrationInterface {
  public name = 'TaskSourceActionOsApproval1796321998500'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check`)
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT tasks_source_check
      CHECK (source IN ('manual', 'lead_conversion', 'action_os_approval'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check`)
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT tasks_source_check
      CHECK (source IN ('manual', 'lead_conversion'))
    `)
  }
}
