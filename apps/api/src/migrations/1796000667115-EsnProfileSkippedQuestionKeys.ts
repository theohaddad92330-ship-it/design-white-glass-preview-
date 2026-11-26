import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2007.11 — les questions qu'un utilisateur a volontairement PASSÉES dans le
 * questionnaire de profil (`ProfileQuestionnaireDialog.tsx`, bouton « passer »).
 *
 * `answer_meta` (migration `1795000000001-OnboardingAnswerMeta.ts`) ne peut
 * PAS porter ce fait tel quel : chaque entrée y suppose une VALEUR (« une
 * valeur existe mais son statut n'a jamais pu être établi »), or une question
 * passée n'a PRÉCISÉMENT aucune valeur — il faut une liste de CLÉS séparée,
 * pas un statut de plus (doctrine « non mesuré ≠ 0 », registre
 * `.claude/notes/registre-2026-09-15-onboarding-audit-welcome.md` #2007.11).
 *
 * ADDITIVE SEULEMENT (GA-11/GA-12) : `NOT NULL DEFAULT '[]'::jsonb` — une
 * ligne existante n'a passé AUCUNE question au sens de ce champ, ce qui est
 * exactement l'état réel d'un profil écrit avant ce lot.
 */
export class EsnProfileSkippedQuestionKeys1796000667115 implements MigrationInterface {
  name = 'EsnProfileSkippedQuestionKeys1796000667115'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS skipped_question_keys jsonb NOT NULL DEFAULT '[]'::jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS skipped_question_keys;
    `)
  }
}
