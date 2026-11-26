import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo O onboarding-relecture.N1/N2 — la décision prise sur chaque orientation
 * du cadrage, et la validation explicite du cadrage.
 *
 * ADDITIVE SEULEMENT (GA-11/GA-12) : une table NEUVE (`framing_decisions`, sa
 * contrainte naît déjà large — trois décisions, trois orientations, écrites en
 * clair comme `framingDecisionSchema` / `framingOrientationIdSchema`) et deux
 * colonnes NULLABLES sur `user_onboarding_state`. Aucune ligne existante n'est
 * réécrite : « pas encore validé » est exactement `NULL`.
 *
 * Pas de policy RLS (même choix que `user_onboarding_transitions` : RLS activée,
 * table API-owned, jamais lue par un client Supabase direct).
 */
export class FramingDecisions1796575047412 implements MigrationInterface {
  name = 'FramingDecisions1796575047412'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS framing_decisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        strategy_key text NOT NULL,
        decision text NOT NULL,
        decided_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT framing_decisions_user_strategy_key UNIQUE (user_id, strategy_key),
        CONSTRAINT framing_decisions_strategy_key_check CHECK (
          strategy_key IN ('proof', 'offer_split', 'decision_review')
        ),
        CONSTRAINT framing_decisions_decision_check CHECK (
          decision IN ('retain', 'later', 'dismiss')
        )
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS framing_decisions_user_idx ON framing_decisions (user_id)`)
    await queryRunner.query(`ALTER TABLE framing_decisions ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      ALTER TABLE user_onboarding_state
        ADD COLUMN IF NOT EXISTS framing_validated_at timestamptz,
        ADD COLUMN IF NOT EXISTS framing_validated_digest text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_onboarding_state
        DROP COLUMN IF EXISTS framing_validated_at,
        DROP COLUMN IF EXISTS framing_validated_digest
    `)
    await queryRunner.query(`DROP TABLE IF EXISTS framing_decisions`)
  }
}
