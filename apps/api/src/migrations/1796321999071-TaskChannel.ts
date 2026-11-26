import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2395.4/#2395.9 (épopée #2901) — `canonicalActionFromTask` (`action.ts`)
 * lisait déjà `task.channel` pour dériver `type`/`expected_outcome` (même
 * patron que `action_plan_items`, GA-26), mais `tasks` n'avait pas de colonne
 * pour le porter : `type` restait `null` sur les 100 % des tâches CRM.
 *
 * Contrainte élargie AVANT le code qui écrit (GA-11/GA-12), NULLABLE sans
 * défaut : une tâche déjà en base reste sans canal — jamais deviné d'un
 * libellé libre (`title`/`details`), aucun rattrapage n'est donc possible
 * ici (contrairement à `ActionPlanItemChannel1796001457744`, qui rattrapait
 * depuis un JSON de plan encore en base : `tasks` n'a aucune source
 * structurée équivalente à relire).
 */
export class TaskChannel1796321999071 implements MigrationInterface {
  public name = 'TaskChannel1796321999071'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS channel TEXT`)
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_channel_check`)
    await queryRunner.query(
      `ALTER TABLE tasks ADD CONSTRAINT tasks_channel_check
         CHECK (channel IS NULL OR channel IN ('phone', 'email', 'linkedin', 'meeting'))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
