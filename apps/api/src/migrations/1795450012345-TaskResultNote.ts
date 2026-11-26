import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2105.54 — L'AUDITABILITÉ COUVRE AUSSI LES TÂCHES.
 *
 * `completed_by` existait déjà (migration `Tasks1789368204517`) et était déjà
 * ÉCRIT (`tasks.service.ts#update`) — jamais LU : ni sélectionné, ni résolu en
 * nom, ni exposé au contrat. Cette migration n'ajoute donc qu'UNE colonne, le
 * « quel résultat » qui manquait réellement : `result_note`, l'équivalent pour
 * une tâche de `outcome` sur une carte Action OS (`cardResultSchema`).
 *
 * Texte libre, nullable, sans contrainte CHECK : aucun enum ici, donc GA-11/12
 * (contrainte AVANT le code qui écrit) ne s'applique pas — il n'y a rien à
 * élargir avant coup.
 */
export class TaskResultNote1795450012345 implements MigrationInterface {
  public name = 'TaskResultNote1795450012345'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_note text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS result_note`)
  }
}
