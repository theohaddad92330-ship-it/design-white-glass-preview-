import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2369.7/.8/.13 (épopée #2768, LAU-FINAL-084) — la proposition de règle de
 * style : une réécriture PROPOSE, elle ne durcit jamais seule une règle
 * (#2369.7) — `status` naît `pending`, et seule une décision humaine explicite
 * l'amène à `adopted`/`rejected` (#2369.8, contrainte `..._decided_pair`
 * ci-dessous : un statut décidé exige décideur ET date, un `pending` n'en
 * porte aucun). `signal` couvre les six valeurs de
 * `MESSAGE_STYLE_LEARNING_SIGNALS`, apprenables ou non (#2369.13) — la garde
 * d'exclusion vit côté service (`isLearnableStyleSignal`), jamais en SQL.
 *
 * `observation` est une phrase courte, jamais le corps d'un message (voir
 * `message-style-rule-proposal.ts`, note de tête).
 */
export class MessageStyleRuleProposals1796321265775 implements MigrationInterface {
  name = 'MessageStyleRuleProposals1796321265775'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_style_rule_proposals (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id      uuid NOT NULL,
        template_id  uuid REFERENCES message_style_templates(id) ON DELETE SET NULL,
        signal       text NOT NULL,
        observation  text NOT NULL,
        status       text NOT NULL DEFAULT 'pending',
        decided_by   uuid,
        decided_at   timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_style_rule_proposals_signal_check CHECK (signal IN (
          'wording_preference', 'structure_preference', 'tone_preference',
          'spelling_or_grammar_fix', 'false_or_fabricated_data_correction', 'isolated_aggressive_tone')),
        CONSTRAINT message_style_rule_proposals_status_check CHECK (status IN ('pending', 'adopted', 'rejected')),
        CONSTRAINT message_style_rule_proposals_decided_pair CHECK (
          (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL) OR
          (status != 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_message_style_rule_proposals_workspace_status ON message_style_rule_proposals (workspace_id, status)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_message_style_rule_proposals_template ON message_style_rule_proposals (template_id)`,
    )
    await queryRunner.query(`ALTER TABLE message_style_rule_proposals ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS message_style_rule_proposals`)
  }
}
