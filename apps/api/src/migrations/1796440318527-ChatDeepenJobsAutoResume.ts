import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3236 (lot W2, décision Louis 11/10) — la reprise AUTOMATIQUE d'une étude Approfondie interrompue.
 *
 * Deux colonnes, ajout seulement : le nombre de reprises faites en fond, et la raison NOMMÉE de l'arrêt
 * (`credit_ceiling`, `max_resumes`, `resume_failed`). Le statut ne s'élargit pas : un arrêt reste
 * `unknown` (un timeout n'est pas un échec), la raison vit à part — la contrainte
 * `chat_deepen_jobs_status_check` est donc inchangée (GA-11/GA-12).
 */
export class ChatDeepenJobsAutoResume1796440318527 implements MigrationInterface {
  public name = 'ChatDeepenJobsAutoResume1796440318527'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE chat_deepen_jobs ADD COLUMN IF NOT EXISTS auto_resumes integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(`ALTER TABLE chat_deepen_jobs ADD COLUMN IF NOT EXISTS stopped_reason text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
