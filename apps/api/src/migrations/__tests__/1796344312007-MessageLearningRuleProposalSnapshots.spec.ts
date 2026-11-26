import type { QueryRunner } from 'typeorm'
import { MessageLearningRuleProposalSnapshots1796344312007 } from '../1796344312007-MessageLearningRuleProposalSnapshots'

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

// #2385.5 (épopée #2877) — la table de snapshots versionnés du candidat de
// règle workspace. Jamais écrasée (contrainte d'unicité sur (workspace_id,
// version)), `status` toujours `'proposed'` en base.
describe('MessageLearningRuleProposalSnapshots1796344312007', () => {
  it('crée la table avec la contrainte d’unicité (workspace_id, version) et le check status', async () => {
    const { runner, queries } = createRunner()
    await new MessageLearningRuleProposalSnapshots1796344312007().up(runner)
    const flat = queries.map(normalize)

    const create = flat.find(q => q.includes('CREATE TABLE IF NOT EXISTS message_learning_rule_proposal_snapshots'))
    expect(create).toBeDefined()
    expect(create).toContain("status text NOT NULL DEFAULT 'proposed'")
    expect(create).toContain(
      'CONSTRAINT message_learning_rule_proposal_snapshots_version_unique UNIQUE (workspace_id, version)',
    )
    expect(create).toContain("CHECK (status = 'proposed')")
  })

  it('active RLS sur la table neuve', async () => {
    const { runner, queries } = createRunner()
    await new MessageLearningRuleProposalSnapshots1796344312007().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE message_learning_rule_proposal_snapshots ENABLE ROW LEVEL SECURITY')
  })

  it('down() supprime la table — sûr, elle est neuve et ne porte aucune donnée existante', async () => {
    const { runner, queries } = createRunner()
    await new MessageLearningRuleProposalSnapshots1796344312007().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS message_learning_rule_proposal_snapshots')
  })
})
