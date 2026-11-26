import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2105.7 / #2105.2 — deux champs retenus de la reconnaissance des tâches.
 *
 * `source` (GA-11/12 : la contrainte SQL s'élargit AVANT le code qui écrit) —
 * NOT NULL avec un défaut, comme `status`/`priority` (migration
 * `Tasks1789368204517`) : les deux seuls appelants connus à ce jour sont le
 * composeur manuel (`POST /tasks`) et la conversion d'un lead
 * (`ProjectsController.convert`), d'où l'énumération à deux valeurs. Le défaut
 * `'manual'` couvre toutes les lignes déjà en base, créées avant ce champ.
 *
 * `expected_result` — texte libre, nullable, sans CHECK : comme `result_note`
 * (migration `TaskResultNote1795450012345`), aucun enum ici.
 */
export class TaskSourceAndExpectedResult1796001512041 implements MigrationInterface {
  public name = 'TaskSourceAndExpectedResult1796001512041'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'`)
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT tasks_source_check CHECK (source IN ('manual', 'lead_conversion'))
    `)
    await queryRunner.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS expected_result text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS expected_result`)
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check`)
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS source`)
  }
}
