import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2385.5 (épopée #2877) — la table qui manquait pour que le candidat de
 * règle au niveau workspace (`proposeWorkspaceMessageLearningRule`) cesse
 * d'être recalculé à la volée sans jamais être HISTORISÉ. Un snapshot par
 * appel volontaire (`POST .../proposed-rule/snapshot`), jamais écrasé —
 * `version_unique` empêche deux lignes de porter le même numéro pour un même
 * workspace, `status` reste toujours `'proposed'` en base (aucun code n'écrit
 * `'applied'`, voir le docblock de l'entité).
 */
export class MessageLearningRuleProposalSnapshots1796344312007 implements MigrationInterface {
  name = 'MessageLearningRuleProposalSnapshots1796344312007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_learning_rule_proposal_snapshots (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id    uuid NOT NULL,
        level           text NOT NULL DEFAULT 'workspace',
        version         integer NOT NULL,
        status          text NOT NULL DEFAULT 'proposed',
        summary         text NOT NULL,
        based_on_sample integer NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_learning_rule_proposal_snapshots_status_check CHECK (status = 'proposed'),
        CONSTRAINT message_learning_rule_proposal_snapshots_version_unique UNIQUE (workspace_id, version)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_message_learning_rule_proposal_snapshots_workspace ON message_learning_rule_proposal_snapshots (workspace_id, version DESC)`,
    )
    await queryRunner.query(`ALTER TABLE message_learning_rule_proposal_snapshots ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS message_learning_rule_proposal_snapshots`)
  }
}
