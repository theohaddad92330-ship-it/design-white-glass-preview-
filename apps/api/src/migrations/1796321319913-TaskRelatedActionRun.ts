import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2105.9 / #2946 — le lien vers un run Action OS, quand une tâche en vient
 * un.
 *
 * Nullable, sans CHECK ni FK — même convention que `account_id`/`contact_id`/
 * `project_id` sur cette même table (migration `Tasks1789368204517`) : la
 * cohérence des rattachements se vérifie côté application (`assertTargets`),
 * pas en base, sur cette table précise. `type` (discriminant #2105.16) ne
 * gagne PAS de colonne : il se dérive de ce champ et des trois rattachements
 * existants (`resolveTaskType`, `@bellum/contracts`) — une colonne calculée
 * en plus serait une seconde vérité (GA-26).
 *
 * ⚠️ Aucun appelant ne pose encore cette colonne : Action OS ne crée pas de
 * tâche à ce jour. Le champ est ajouté en avance du pont qui l'écrira,
 * conformément au périmètre retenu de l'épopée #2946 — pas une capacité
 * fantôme, une fondation pour la prochaine tranche.
 */
export class TaskRelatedActionRun1796321319913 implements MigrationInterface {
  public name = 'TaskRelatedActionRun1796321319913'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS related_action_run_id uuid`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS related_action_run_id`)
  }
}
