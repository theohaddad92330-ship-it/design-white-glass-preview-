import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2335.1 / #2335.2 (LAU-FINAL-076) — le sous-statut, ADDITIF sur `submissions`.
 *
 * Nullable, SANS défaut : une ligne déjà en base n'a jamais déclaré l'un des
 * seize sous-statuts (`SUBMISSION_SUBSTATUSES`, `packages/contracts`), et lui
 * en inventer un serait une déclaration qui n'a pas eu lieu — même principe
 * que `photo_url` (`1790973000001-ConsultantPhotoUrl.ts`). `stage` reste la
 * machine qui pilote staffing/collision/propositions ; `substatus` est un
 * niveau de détail EN PLUS, jamais un remplacement.
 *
 * La contrainte CHECK est posée AVANT le code qui écrit la valeur (GA-11/GA-12).
 */
export class SubmissionSubstatus1795999454405 implements MigrationInterface {
  public name = 'SubmissionSubstatus1795999454405'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS substatus text`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'submissions_substatus_check'
        ) THEN
          ALTER TABLE submissions
            ADD CONSTRAINT submissions_substatus_check
            CHECK (substatus IS NULL OR substatus IN (
              'to_qualify', 'consultant_agreement_pending', 'ready_to_present', 'to_validate',
              'presented', 'acknowledged', 'interview_to_schedule', 'interview_scheduled',
              'interview_done', 'second_interview', 'selected', 'declined', 'withdrawn',
              'no_response', 'converted_to_mission', 'archived'
            ));
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_substatus_check`)
    await queryRunner.query(`ALTER TABLE submissions DROP COLUMN IF EXISTS substatus`)
  }
}
