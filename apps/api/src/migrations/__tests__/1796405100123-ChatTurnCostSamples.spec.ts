import type { QueryRunner } from 'typeorm'
import { ChatTurnCostSamples1796405100123 } from '../1796405100123-ChatTurnCostSamples'

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

describe('ChatTurnCostSamples1796405100123', () => {
  it('creates chat_turn_cost_samples with the tier CHECK widened before any code writes (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new ChatTurnCostSamples1796405100123().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS chat_turn_cost_samples'))
    expect(create).toBeDefined()
    expect(create).toContain("CONSTRAINT chat_turn_cost_samples_tier_check CHECK (tier IN ('fast', 'deep'))")
    expect(create).toContain('CONSTRAINT chat_turn_cost_samples_duration_ms_check CHECK (duration_ms >= 0)')
    expect(create).toContain('cost_usd numeric NULL')
    // Anonyme par construction (doctrine c64) : ni workspace_id ni user_id.
    expect(create).not.toContain('workspace_id')
    expect(create).not.toContain('user_id')
  })

  it('indexes (tier, measured_at) for the per-tier window read', async () => {
    const { runner, queries } = createRunner()
    await new ChatTurnCostSamples1796405100123().up(runner)
    const index = queries.map(normalize).find(q => q.includes('chat_turn_cost_samples_tier_measured_at_idx'))
    expect(index).toBeDefined()
    expect(index).toContain('ON chat_turn_cost_samples (tier, measured_at)')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new ChatTurnCostSamples1796405100123().down()).rejects.toThrow('down migrations are not supported')
  })
})
