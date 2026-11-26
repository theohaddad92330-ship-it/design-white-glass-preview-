import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2006.2 → .11 / #2006.22 — le contrat d'une réponse d'onboarding, au-delà
 * de sa valeur brute.
 *
 * `esn_profiles` porte 113 colonnes plates : chacune la VALEUR d'une réponse,
 * aucune sa question, sa source, sa confiance, sa date, son auteur, son
 * statut de confirmation, la version du questionnaire, le motif de
 * branchement ou ses consommateurs produit. `answer_meta` porte cette
 * enveloppe, PAR CLÉ (`Record<answerKey, AnswerMeta>`, `@bellum/contracts`),
 * dans une seule colonne JSONB plutôt que onze colonnes par réponse × 113
 * réponses.
 *
 * ADDITIVE SEULEMENT (GA-11/GA-12) : `NOT NULL DEFAULT '{}'::jsonb` — une
 * ligne existante n'a d'entrée pour AUCUNE clé, ce qui est exactement ce que
 * #2006.22 demande : une réponse historique n'a jamais été « confirmée », et
 * l'absence d'entrée doit se lire comme telle (`resolveAnswerStatus` rend
 * `proposed`, jamais `confirmed`, pour une clé absente d'`answer_meta`).
 * Aucune donnée n'est réécrite ici — la migration élargit le SCHÉMA, la
 * lecture (`mapRowToAnswerMeta`) fait le reste.
 */
export class OnboardingAnswerMeta1795000000001 implements MigrationInterface {
  name = 'OnboardingAnswerMeta1795000000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS answer_meta jsonb NOT NULL DEFAULT '{}'::jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS answer_meta;
    `)
  }
}
