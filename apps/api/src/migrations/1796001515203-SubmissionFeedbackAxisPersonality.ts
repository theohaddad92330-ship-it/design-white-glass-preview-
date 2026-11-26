import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2178.29 — le ONZIÈME axe du retour client, « personnalité ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE SEULE COLONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2178 demande huit axes de feedback quand un client refuse un profil :
 * compétence, séniorité, contexte, timing, budget, personnalité, disponibilité,
 * autre. `submission_feedback` (`1795999455405-SubmissionFeedbackAxesExtended`,
 * LAU-FINAL-076) en portait déjà DIX, dont sept couvrent ces huit demandés —
 * `technical`, `seniority`, `context`, `timing`, `price`, `availability`,
 * `other`. Seule « personnalité » manquait : ni `communication` (proche mais
 * différent — un mode d'échange, pas un trait de personne) ni aucun autre axe
 * existant ne la nomme.
 *
 * Même patron que la migration `1795999455405` : `ADD COLUMN … DEFAULT
 * 'unknown'` laisse chaque ligne déjà écrite intacte — son onzième axe vaut
 * « non abordé », jamais un avis deviné. La contrainte `CHECK` est élargie
 * AVANT le code qui écrit la valeur (GA-11/GA-12), ajoutée EN FIN (GA-08).
 */
export class SubmissionFeedbackAxisPersonality1796001515203 implements MigrationInterface {
  public name = 'SubmissionFeedbackAxisPersonality1796001515203'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS personality text NOT NULL DEFAULT 'unknown'`,
    )

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
            AND personality IN ('unknown', 'below', 'meets', 'above')
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
            AND seniority IN ('unknown', 'below', 'meets', 'above')
            AND context IN ('unknown', 'below', 'meets', 'above')
            AND availability IN ('unknown', 'below', 'meets', 'above')
            AND location IN ('unknown', 'below', 'meets', 'above')
            AND timing IN ('unknown', 'below', 'meets', 'above')
            AND "other" IN ('unknown', 'below', 'meets', 'above')
          );
      END $$;
    `)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS personality`)
  }
}
