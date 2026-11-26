import { TypeormWorkProgressReader } from './work-progress.reader'

// #4611.4 / .5 / .8 — le SQL du lecteur : chaque compteur sa requête, l'espace toujours borné, le périmètre appliqué.

/** Un QueryBuilder qui enregistre ses clauses ; `getCount` rend la valeur du scénario, ou LÈVE. */
function recorder(counts: (clauses: string[]) => number | Error) {
  const built: string[][] = []
  const make = () => {
    const clauses: string[] = []
    built.push(clauses)
    const qb: Record<string, unknown> = {}
    const chain = (...keys: string[]) => keys.forEach(key => (qb[key] = (..._a: unknown[]) => qb))
    chain('innerJoin', 'leftJoin', 'select', 'addSelect', 'orderBy', 'limit')
    qb.where = (clause: string) => (clauses.push(clause), qb)
    qb.andWhere = (clause: string) => (clauses.push(clause), qb)
    qb.getCount = async () => {
      const value = counts(clauses)
      if (value instanceof Error) throw value
      return value
    }
    qb.getRawOne = async () => ({ since: new Date('2026-10-26T09:00:00Z'), last: '2026-10-28T09:00:00Z' })
    qb.getRawMany = async () => [
      { label: 'Thales', reason: '  launch_error ', at: '2026-10-28T08:00:00Z' },
      { label: '', reason: ' ', at: null },
    ]
    return qb
  }
  return { built, repo: { createQueryBuilder: jest.fn(make), findOne: jest.fn() } }
}

const query = (over = {}) => ({
  workspaceId: 'ws-1',
  userId: 'u-1',
  businessUnitScope: null,
  since: new Date('2026-10-21T00:00:00Z'),
  ...over,
})

function reader(parts: {
  items?: ReturnType<typeof recorder>
  imports?: ReturnType<typeof recorder>
  runs?: ReturnType<typeof recorder>
}) {
  const nothing = recorder(() => 0).repo
  return new TypeormWorkProgressReader(
    nothing as never,
    (parts.items ?? recorder(() => 0)).repo as never,
    (parts.imports ?? recorder(() => 0)).repo as never,
    nothing as never,
    nothing as never,
    (parts.runs ?? recorder(() => 0)).repo as never,
  )
}

describe('TypeormWorkProgressReader — #4611', () => {
  it('imports : un import PERSONNEL d’un autre membre n’est jamais compté', async () => {
    const imports = recorder(() => 3)
    await reader({ imports }).imports(query())
    const launched = imports.built.find(clauses => clauses.some(c => c.includes("j.scope = 'workspace' OR j.user_id")))
    expect(launched).toBeDefined()
    expect(imports.built.every(clauses => clauses[0]?.includes('j.workspace_id = :workspaceId'))).toBe(true)
  })

  it('analyses : chaque compteur a SA requête, l’espace est borné partout, le périmètre s’applique', async () => {
    const items = recorder(clauses => (clauses.some(c => c.includes('i.state IN')) ? 2 : 9))
    const out = await reader({ items }).analysis(
      query({ businessUnitScope: { businessUnitIds: ['bu-1'], includeUnassigned: true } }),
    )
    expect(out.measures).toEqual({ launched: 9, done: 2, failed: 2, running: 2 })
    const counting = items.built.filter(clauses =>
      clauses[0]?.includes('i.workspace_id = :workspaceId AND b.workspace_id'),
    )
    expect(counting.length).toBeGreaterThanOrEqual(4)
    expect(counting.every(clauses => clauses.some(c => c.includes('a.business_unit_id IN')))).toBe(true)
  })

  it('un compteur dont la requête échoue reste null (nommé non mesuré), les autres restent mesurés', async () => {
    const items = recorder(clauses =>
      clauses.some(c => c.includes('i.state IN')) ? new Error('statement timeout') : 7,
    )
    const out = await reader({ items }).analysis(query())
    expect(out.measures).toEqual({ launched: 7, done: null, failed: null, running: null })
  })

  it('une raison d’échec vide reste null — jamais une raison devinée ; un libellé vide est nommé', async () => {
    const out = await reader({ items: recorder(() => 1) }).analysis(query())
    expect(out.failures).toEqual([
      { label: 'Thales', reason: 'launch_error', at: '2026-10-28T08:00:00.000Z' },
      { label: 'Sans nom', reason: null, at: null },
    ])
    expect(out.since).toBe('2026-10-26T09:00:00.000Z')
  })

  it('un identifiant de lot mal formé n’atteint jamais la base', async () => {
    const batches = recorder(() => 0)
    const r = new TypeormWorkProgressReader(
      batches.repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    expect(await r.findAnalysisLot("x'; drop table")).toBeNull()
    expect(batches.repo.findOne).not.toHaveBeenCalled()
  })
})

describe('TypeormWorkProgressReader — les jobs de Laura (#4611, lot L6)', () => {
  it('chaque compteur sa requête, bornée à l’espace, à l’APPELANT et aux jobs de Laura', async () => {
    const runs = recorder(clauses => (clauses.some(c => c.includes('r.status IN')) ? 1 : 3))
    const out = await reader({ runs }).lauraJobs(query())
    expect(out.measures).toEqual({ launched: 3, done: 1, failed: 1, running: 1 })
    const counted = runs.built.slice(0, 4)
    for (const clauses of counted) {
      expect(clauses.join(' ')).toContain('r.workspace_id = :workspaceId')
      expect(clauses.join(' ')).toContain('r.user_id = :userId')
      expect(clauses.join(' ')).toContain('r.definition_key = :definitionKey')
    }
  })

  it('NON — un compteur dont la requête échoue reste non mesuré, les autres tiennent', async () => {
    const runs = recorder(clauses => (clauses.some(c => c.includes('r.status IN')) ? new Error('db') : 3))
    const out = await reader({ runs }).lauraJobs(query())
    expect(out.measures.launched).toBe(3)
    expect(out.measures.done).toBeNull()
  })
})
