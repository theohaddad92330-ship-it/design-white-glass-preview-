import type { QueryRunner } from 'typeorm'
import { MessageLearningRuleProposalSnapshotsDecision1796405091234 } from '../1796405091234-MessageLearningRuleProposalSnapshotsDecision'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

// #2385.1/#2385.5 (épopée #2877) — GA-11/12 : le CHECK s'élargit avant le
// geste de décision qui écrit `adopted`/`rejected`.
describe('MessageLearningRuleProposalSnapshotsDecision1796405091234', () => {
  it('ajoute decided_at, nullable', async () => {
    const { runner, queries } = createRunner()
    await new MessageLearningRuleProposalSnapshotsDecision1796405091234().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain(
      'ALTER TABLE message_learning_rule_proposal_snapshots ADD COLUMN IF NOT EXISTS decided_at timestamptz',
    )
  })

  it('élargit le CHECK status à proposed/adopted/rejected — jamais rétréci', async () => {
    const { runner, queries } = createRunner()
    await new MessageLearningRuleProposalSnapshotsDecision1796405091234().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain(
      'ALTER TABLE message_learning_rule_proposal_snapshots DROP CONSTRAINT IF EXISTS message_learning_rule_proposal_snapshots_status_check',
    )
    const add = flat.find(q => q.includes('ADD CONSTRAINT message_learning_rule_proposal_snapshots_status_check'))
    expect(add).toBeDefined()
    expect(add).toContain("CHECK (status IN ('proposed', 'adopted', 'rejected'))")
  })

  it('ajoute la paire décidée : un statut décidé exige decided_at, proposed n’en porte aucun', async () => {
    const { runner, queries } = createRunner()
    await new MessageLearningRuleProposalSnapshotsDecision1796405091234().up(runner)
    const flat = queries.map(normalize)
    const pair = flat.find(q => q.includes('ADD CONSTRAINT message_learning_rule_proposal_snapshots_decided_pair'))
    expect(pair).toBeDefined()
    expect(pair).toContain("(status = 'proposed' AND decided_at IS NULL)")
    expect(pair).toContain("(status != 'proposed' AND decided_at IS NOT NULL)")
  })

  it('down() revient au CHECK figé sur proposed et retire decided_at', async () => {
    const { runner, queries } = createRunner()
    await new MessageLearningRuleProposalSnapshotsDecision1796405091234().down(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain(
      "ALTER TABLE message_learning_rule_proposal_snapshots ADD CONSTRAINT message_learning_rule_proposal_snapshots_status_check CHECK (status = 'proposed')",
    )
    expect(flat).toContain('ALTER TABLE message_learning_rule_proposal_snapshots DROP COLUMN IF EXISTS decided_at')
  })
})
