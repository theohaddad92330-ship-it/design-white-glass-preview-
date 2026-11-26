import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3223 (décision Louis 11/10/2026) — LES VERDICTS DU JUGE « RECOMMANDATION GÉNÉRIQUE ».
 *
 * Une ligne par réponse de Laura tirée dans l'échantillon quotidien
 * (`ReasoningJudgeSamplingService`) et jugée par le service IA
 * (`apps/ia/app/eval/generic_recommendation_judge.py`).
 *
 * CE QUE LA TABLE N'A PAS, À DESSEIN : ni `workspace_id`, ni `user_id`, ni
 * texte. Le verdict est un JETON FERMÉ ; la réponse jugée ne se recopie pas —
 * le lien vers le message suffit à la lecture agrégée (`reasoning-quality`),
 * et la cascade fait disparaître le verdict avec le message (purge d'une salle
 * de démo, effacement RGPD).
 *
 * `judge_version` : l'empreinte du juge (modèle + consigne). Seuls les verdicts
 * du juge CALIBRÉ (`GENERIC_JUDGE_CALIBRATION.judgeVersion`) entrent dans la
 * mesure ; les autres sortent du dénominateur et se comptent.
 *
 * PORTE « AJOUT SEULEMENT » : création pure, contraintes NOMMÉES posées dès la
 * création, avant le code qui écrit (GA-11 / GA-12, GA-177). Rejouable.
 */
export class ChatGenericJudgements1796438109661 implements MigrationInterface {
  name = 'ChatGenericJudgements1796438109661'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_generic_judgements (
        message_id uuid PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
        verdict text NOT NULL,
        judge_version text NOT NULL,
        judged_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chat_generic_judgements_verdict_check'
        ) THEN
          ALTER TABLE chat_generic_judgements
          ADD CONSTRAINT chat_generic_judgements_verdict_check
          CHECK (verdict IN ('generique', 'specifique', 'sans_recommandation'));
        END IF;
      END $$;
    `)

    // Service seulement : aucun espace client ne lit cette table.
    await queryRunner.query(`ALTER TABLE chat_generic_judgements ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS chat_generic_judgements_judged_at_idx ON chat_generic_judgements (judged_at)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS chat_generic_judgements_judged_at_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS chat_generic_judgements`)
  }
}
