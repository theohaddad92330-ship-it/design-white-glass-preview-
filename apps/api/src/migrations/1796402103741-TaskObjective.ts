import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2871 (#2395.8, second volet) — `action_plan_items.reason` et
 * `outreach_call_tasks.objective` portaient déjà « pourquoi cette action » ;
 * `tasks` n'avait ni l'un ni l'autre (`expected_result` répond à « à quoi
 * ressemble fait », pas à « pourquoi »). Additive, nullable, aucun objectif
 * deviné pour les lignes déjà en base — `createTaskSchema.objective` le rend
 * REQUIS pour toute création à partir de ce lot (composeur, doctrine « jamais
 * de donnée fictive »).
 */
export class TaskObjective1796402103741 implements MigrationInterface {
  public name = 'TaskObjective1796402103741'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS objective text
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
