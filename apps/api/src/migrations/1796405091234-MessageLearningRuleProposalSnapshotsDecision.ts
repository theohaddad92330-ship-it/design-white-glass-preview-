import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2385.1/#2385.5 (épopée #2877) — GA-11/12 : le CHECK s'élargit AVANT le code
 * qui écrit une valeur neuve, jamais après.
 *
 * `message_learning_rule_proposal_snapshots.status` restait figé à
 * `'proposed'` (contrainte `= 'proposed'`, migration `1796344312007`) — la
 * persistance existait, mais aucun geste humain ne pouvait jamais la faire
 * sortir de cet état. Cette migration ouvre le SEUL mécanisme qui manquait au
 * NO-GO #2385.1 (« ne pas sur-apprendre d'un cas isolé ») pour devenir
 * vérifiable de bout en bout : un opérateur peut désormais ADOPTER ou REFUSER
 * un snapshot déjà enregistré — jamais la création elle-même, même discipline
 * que `message_style_rule_proposals` (#2369.7/.8, migration `1796321265775`).
 *
 * `decided_pair` copie exactement la contrainte de ce précédent : un statut
 * décidé exige une date, `proposed` n'en porte aucune — pas de décision
 * silencieuse, pas de date orpheline.
 */
export class MessageLearningRuleProposalSnapshotsDecision1796405091234 implements MigrationInterface {
  name = 'MessageLearningRuleProposalSnapshotsDecision1796405091234'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE message_learning_rule_proposal_snapshots
      ADD COLUMN IF NOT EXISTS decided_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE message_learning_rule_proposal_snapshots
      DROP CONSTRAINT IF EXISTS message_learning_rule_proposal_snapshots_status_check
    `)
    await queryRunner.query(`
      ALTER TABLE message_learning_rule_proposal_snapshots
      ADD CONSTRAINT message_learning_rule_proposal_snapshots_status_check
      CHECK (status IN ('proposed', 'adopted', 'rejected'))
    `)
    await queryRunner.query(`
      ALTER TABLE message_learning_rule_proposal_snapshots
      ADD CONSTRAINT message_learning_rule_proposal_snapshots_decided_pair CHECK (
        (status = 'proposed' AND decided_at IS NULL) OR
        (status != 'proposed' AND decided_at IS NOT NULL)
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE message_learning_rule_proposal_snapshots
      DROP CONSTRAINT IF EXISTS message_learning_rule_proposal_snapshots_decided_pair
    `)
    await queryRunner.query(`
      ALTER TABLE message_learning_rule_proposal_snapshots
      DROP CONSTRAINT IF EXISTS message_learning_rule_proposal_snapshots_status_check
    `)
    await queryRunner.query(`
      ALTER TABLE message_learning_rule_proposal_snapshots
      ADD CONSTRAINT message_learning_rule_proposal_snapshots_status_check CHECK (status = 'proposed')
    `)
    await queryRunner.query(`
      ALTER TABLE message_learning_rule_proposal_snapshots
      DROP COLUMN IF EXISTS decided_at
    `)
  }
}
