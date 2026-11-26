import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2875/#3398 (BM) — « entretien à préparer ». `interviews` ne portait aucun
 * champ disant si le brief d'entretien (`interview-brief.ts`,
 * `InterviewBriefDialog`) a déjà été ouvert — ni fait, ni prochaine action
 * saisis sur ce manque, contrairement au débrief d'appel (`call_debrief`).
 *
 * Nullable, posé une seule fois à la première ouverture : `NULL` = jamais
 * consulté, c'est ce que lit `interview_brief_not_consulted`
 * (`laura-detector.ts`).
 */
export class InterviewBriefViewedAt1796437712913 implements MigrationInterface {
  public name = 'InterviewBriefViewedAt1796437712913'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE interviews ADD COLUMN IF NOT EXISTS brief_viewed_at timestamptz
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
