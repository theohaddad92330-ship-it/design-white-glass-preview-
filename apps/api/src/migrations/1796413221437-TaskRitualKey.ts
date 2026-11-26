import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3271.8 reste (épopée #3298) — « ACTIONS CRÉÉES » PAR RITUEL.
 *
 * Le catalogue des rituels refuse un troisième journal de décision. La voie
 * honnête est de taguer la TÂCHE à sa création : `tasks.ritual_key`, posé
 * UNIQUEMENT par le geste « Créer une action » de l'écran des rituels, jamais
 * déduit d'une fenêtre de temps. NULL pour toute autre tâche et pour toutes les
 * lignes antérieures — jamais un rituel deviné après coup.
 *
 * `ritual_key` contraint aux cinq clés RÉELLES du catalogue (`RITUAL_KEYS`,
 * GA-11/GA-12), même liste que `workspace_ritual_last_held`.
 */
export class TaskRitualKey1796413221437 implements MigrationInterface {
  name = 'TaskRitualKey1796413221437'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ritual_key text`)
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_ritual_key_check`)
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT tasks_ritual_key_check
        CHECK (ritual_key IS NULL OR ritual_key IN ('daily', 'weekly', 'monthly', 'quarterly', 'rank1'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS tasks_workspace_ritual_key_idx
        ON tasks (workspace_id, ritual_key) WHERE ritual_key IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS tasks_workspace_ritual_key_idx`)
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_ritual_key_check`)
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS ritual_key`)
  }
}
