import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2335.4 / #2335.6 (LAU-FINAL-076) — dix axes de retour client, pas quatre,
 * et un apprentissage libre qui n'écrase jamais une preuve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SIX COLONNES DE PLUS, ET NON UN REMPLACEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `submission_feedback` portait quatre axes (`technical`/`experience`/
 * `communication`/`price`). LAU-FINAL-076 en demande dix : séniorité, contexte,
 * disponibilité, localisation, timing, autre s'ajoutent. Les remplacer aurait
 * fait perdre un retour déjà écrit ; ADD COLUMN … DEFAULT 'unknown' laisse
 * chaque ligne existante intacte — ses quatre axes restent ce qu'ils étaient,
 * les six nouveaux valent « non mesuré », jamais un avis deviné.
 *
 * `learning` est une note libre, PUREMENT additive : rien dans le code ne la
 * lit pour réécrire une compétence ou un champ du profil consultant (voir
 * `SubmissionsService.recordFeedback`) — elle ne peut donc jamais écraser une
 * preuve déjà posée. C'est la garantie que #2335.6 demande.
 *
 * La contrainte `CHECK` est élargie AVANT le code qui écrit les six nouvelles
 * valeurs (GA-11/GA-12) — même patron que `submission_feedback_verdicts_check`
 * posée par `1789382641057-Submissions.ts`.
 */
export class SubmissionFeedbackAxesExtended1795999455405 implements MigrationInterface {
  public name = 'SubmissionFeedbackAxesExtended1795999455405'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS seniority text NOT NULL DEFAULT 'unknown'`,
    )
    await queryRunner.query(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'unknown'`,
    )
    await queryRunner.query(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'unknown'`,
    )
    await queryRunner.query(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT 'unknown'`,
    )
    await queryRunner.query(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS timing text NOT NULL DEFAULT 'unknown'`,
    )
    await queryRunner.query(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS "other" text NOT NULL DEFAULT 'unknown'`,
    )
    // #2335.6 — l'apprentissage, nullable, jamais généré : rempli seulement
    // quand un humain l'écrit.
    await queryRunner.query(`ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS learning text`)

    // `ADD CONSTRAINT` n'a pas d'`IF NOT EXISTS` en Postgres → garde explicite.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'submission_feedback_verdicts_check'
        ) THEN
          ALTER TABLE submission_feedback DROP CONSTRAINT submission_feedback_verdicts_check;
        END IF;
        ALTER TABLE submission_feedback
          ADD CONSTRAINT submission_feedback_verdicts_check
          CHECK (
            technical IN ('unknown', 'below', 'meets', 'above')
            AND experience IN ('unknown', 'below', 'meets', 'above')
            AND communication IN ('unknown', 'below', 'meets', 'above')
            AND price IN ('unknown', 'below', 'meets', 'above')
            AND seniority IN ('unknown', 'below', 'meets', 'above')
            AND context IN ('unknown', 'below', 'meets', 'above')
            AND availability IN ('unknown', 'below', 'meets', 'above')
            AND location IN ('unknown', 'below', 'meets', 'above')
            AND timing IN ('unknown', 'below', 'meets', 'above')
            AND "other" IN ('unknown', 'below', 'meets', 'above')
          );
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'submission_feedback_verdicts_check'
        ) THEN
          ALTER TABLE submission_feedback DROP CONSTRAINT submission_feedback_verdicts_check;
        END IF;
        ALTER TABLE submission_feedback
          ADD CONSTRAINT submission_feedback_verdicts_check
          CHECK (
            technical IN ('unknown', 'below', 'meets', 'above')
            AND experience IN ('unknown', 'below', 'meets', 'above')
            AND communication IN ('unknown', 'below', 'meets', 'above')
            AND price IN ('unknown', 'below', 'meets', 'above')
          );
      END $$;
    `)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS learning`)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS "other"`)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS timing`)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS location`)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS availability`)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS context`)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS seniority`)
  }
}
