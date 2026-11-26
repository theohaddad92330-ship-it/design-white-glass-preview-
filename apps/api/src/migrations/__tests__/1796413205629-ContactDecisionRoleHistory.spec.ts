import type { QueryRunner } from 'typeorm'
import { ContactDecisionRoleHistory1796413205629 } from '../1796413205629-ContactDecisionRoleHistory'

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
const flatten = (queries: string[]): string => queries.map(q => q.replace(/\s+/g, ' ').trim()).join(' ; ')

describe('ContactDecisionRoleHistory1796413205629', () => {
  it('crée la mémoire de transition, cascade sur le contact (effacement RGPD)', async () => {
    const { runner, queries } = createRunner()
    await new ContactDecisionRoleHistory1796413205629().up(runner)
    const flat = flatten(queries)
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS contact_decision_role_history')
    expect(flat).toContain('REFERENCES contacts(id) ON DELETE CASCADE')
    expect(flat).toContain('from_role text')
    expect(flat).toContain('emitted_at timestamptz')
  })

  it('le trigger ne consigne QUE un changement réel de decision_role, jamais une autre colonne', async () => {
    const { runner, queries } = createRunner()
    await new ContactDecisionRoleHistory1796413205629().up(runner)
    const flat = flatten(queries)
    expect(flat).toContain('AFTER UPDATE OF decision_role ON contacts')
    expect(flat).toContain('WHEN (OLD.decision_role IS DISTINCT FROM NEW.decision_role)')
  })

  it('l’horodatage du fichier, du nom et de la classe est le même et non rond', () => {
    expect(new ContactDecisionRoleHistory1796413205629().name).toBe('ContactDecisionRoleHistory1796413205629')
    expect(1796413205629 % 1000).not.toBe(0)
  })
})
