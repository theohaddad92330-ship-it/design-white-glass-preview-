import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3416 — GA-11/12 : la contrainte SQL s'élargit AVANT le code qui écrit.
 * `ActionPlanItemsService.scheduleCallbackTask` pose la relance d'une action
 * close « À rappeler » avec `source = 'plan_callback'` (`task.ts::TASK_SOURCES`) ;
 * elle portait `manual`, ce qui la faisait passer pour une tâche tapée à la main.
 */
export class TaskSourcePlanCallback1796436512337 implements MigrationInterface {
  public name = 'TaskSourcePlanCallback1796436512337'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check`)
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT tasks_source_check
      CHECK (source IN ('manual', 'lead_conversion', 'action_os_approval', 'plan_callback'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les lignes `plan_callback` redeviennent `manual` : la contrainte d'avant les connaît.
    await queryRunner.query(`UPDATE tasks SET source = 'manual' WHERE source = 'plan_callback'`)
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check`)
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT tasks_source_check
      CHECK (source IN ('manual', 'lead_conversion', 'action_os_approval'))
    `)
  }
}
