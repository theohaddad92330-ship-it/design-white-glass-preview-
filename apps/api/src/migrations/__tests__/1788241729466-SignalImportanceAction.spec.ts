import type { QueryRunner } from 'typeorm'
import { SignalImportanceAction1788241729466 } from '../1788241729466-SignalImportanceAction'

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

describe('SignalImportanceAction1788241729466', () => {
  it('adds a NULLABLE importance and action_id, idempotently', async () => {
    const { runner, queries } = createRunner()
    await new SignalImportanceAction1788241729466().up(runner)
    const sql = queries.map(normalize)

    expect(sql).toContain('ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS importance text')
    expect(sql).toContain('ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS action_id uuid')
  })

  it('constrains importance to the short scale and tolerates NULL (rien à pondérer)', async () => {
    const { runner, queries } = createRunner()
    await new SignalImportanceAction1788241729466().up(runner)
    const check = queries.map(normalize).find(q => q.includes('signal_history_importance_check'))

    expect(check).toContain("CHECK (importance IS NULL OR importance IN ('high', 'medium', 'low'))")
    expect(check).toContain('IF NOT EXISTS ( SELECT 1 FROM pg_constraint')
  })

  it('links action_id to action_plan_items, and deleting the action clears the link only', async () => {
    const { runner, queries } = createRunner()
    await new SignalImportanceAction1788241729466().up(runner)
    const fk = queries.map(normalize).find(q => q.includes('signal_history_action_id_fkey'))

    expect(fk).toContain('FOREIGN KEY (action_id) REFERENCES action_plan_items(id) ON DELETE SET NULL')
  })

  it('backfills NOTHING — l’importance se stampe à la prochaine matérialisation', async () => {
    const { runner, queries } = createRunner()
    await new SignalImportanceAction1788241729466().up(runner)
    const sql = queries.map(normalize)

    expect(sql.some(q => q.startsWith('UPDATE signal_history'))).toBe(false)
    expect(sql.some(q => q.includes('INSERT INTO'))).toBe(false)
    expect(sql.some(q => q.includes('CREATE INDEX IF NOT EXISTS signal_history_action_idx'))).toBe(true)
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new SignalImportanceAction1788241729466().down()).rejects.toThrow('down migrations are not supported')
  })
})
