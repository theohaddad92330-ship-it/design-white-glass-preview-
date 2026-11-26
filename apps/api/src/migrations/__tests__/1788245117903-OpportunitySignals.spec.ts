import type { QueryRunner } from 'typeorm'
import { OpportunitySignals1788245117903 } from '../1788245117903-OpportunitySignals'

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

describe('OpportunitySignals1788245117903', () => {
  it('projette les signaux du stock existant sous leur PROPRE nature', async () => {
    const { runner, queries } = createRunner()
    await new OpportunitySignals1788245117903().up(runner)
    const sql = normalize(queries[0] ?? '')
    expect(sql).toContain('INSERT INTO opportunities')
    expect(sql).toContain("'signal'")
    // Lit le libellé sous ses quatre clés historiques — sinon les lignes legacy
    // seraient silencieusement absentes du graphe.
    for (const key of ['title', 'label', 'description', 'signal']) {
      expect(sql).toContain(`s->>'${key}'`)
    }
    // La VRAIE source est conservée (« Les Échos »), pas le nom de la lane.
    expect(sql).toContain("COALESCE(NULLIF(btrim(s->>'source'), ''), 'signal')")
    // Sans source, pas de preuve : confiance basse. Jamais de confiance inventée.
    expect(sql).toContain("CASE WHEN NULLIF(btrim(s->>'source'), '') IS NULL THEN 'low' ELSE 'medium' END")
  })

  it('est rejouable et n’écrase aucun cycle de vie', async () => {
    const { runner, queries } = createRunner()
    await new OpportunitySignals1788245117903().up(runner)
    expect(normalize(queries[0] ?? '')).toContain('ON CONFLICT (account_id, kind, md5(label)) DO NOTHING')
  })

  it('ignore un signal sans libellé — pas de ligne vide dans le graphe', async () => {
    const { runner, queries } = createRunner()
    await new OpportunitySignals1788245117903().up(runner)
    expect(normalize(queries[0] ?? '')).toContain('IS NOT NULL')
  })

  it('down() suit la convention du dépôt (forward-only)', async () => {
    await expect(new OpportunitySignals1788245117903().down()).rejects.toThrow('down migrations are not supported')
  })
})
