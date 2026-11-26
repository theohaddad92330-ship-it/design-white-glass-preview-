import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2958.98 (DEC-4036 Q5, décision Louis 19/10/2026) — l'exception NOMMÉE du rejeu
 * d'évaluation : le corps des messages de l'utilisateur désigné par
 * `EVAL_MESSAGE_BODY_USER_ID` (et de lui seul) peut être versé, anonymisé, dans
 * `chat_eval_samples`. Un corps dépasse les 500 caractères d'un tour ordinaire :
 * la borne s'élargit à `MAX_EVAL_MESSAGE_BODY_CHARS` (4 000, la même que la
 * lecture d'un fil par Laura), AVANT le code qui l'écrit (GA-11/GA-12). Le
 * service garde 500 pour tout autre tour (`MAX_SAMPLED_TURN_CHARS`).
 */
export class ChatEvalSampleBodyException1796560602298 implements MigrationInterface {
  name = 'ChatEvalSampleBodyException1796560602298'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE chat_eval_samples DROP CONSTRAINT IF EXISTS chat_eval_samples_text_length_check`,
    )
    await queryRunner.query(`
      ALTER TABLE chat_eval_samples
        ADD CONSTRAINT chat_eval_samples_text_length_check CHECK (char_length(anonymized_text) BETWEEN 1 AND 4000)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE chat_eval_samples DROP CONSTRAINT IF EXISTS chat_eval_samples_text_length_check`,
    )
    await queryRunner.query(`
      ALTER TABLE chat_eval_samples
        ADD CONSTRAINT chat_eval_samples_text_length_check CHECK (char_length(anonymized_text) BETWEEN 1 AND 500)
    `)
  }
}
