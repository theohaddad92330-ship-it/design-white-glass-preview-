import { ImportedQualificationSignals } from './qualification-signals'

type Call = { sql: string; params: unknown[] }
type Data = {
  tier?: string | null
  personas?: { title: string; decision_level: number }[]
  contacts?: { title: string | null }[]
}

function build(data: Data) {
  const calls: Call[] = []
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
      if (sql.includes('target_list_items')) return data.tier ? [{ tier_label: data.tier }] : []
      if (sql.includes('esn_target_personas')) return data.personas ?? []
      return []
    }),
  }
  const contactsRepo = {
    find: jest.fn(async (opts: unknown) => {
      calls.push({ sql: 'contacts.find', params: [opts] })
      return data.contacts ?? []
    }),
  }
  return { signals: new ImportedQualificationSignals(dataSource as never, contactsRepo as never), calls }
}

describe('ImportedQualificationSignals — #3755.8', () => {
  it('le tier vient de target_list_items.tier_label, borné à l’espace et aux listes partagées', async () => {
    const { signals, calls } = build({ tier: 'B' })
    expect(await signals.getTier('acc-1', 'ws-1')).toBe('Tier B')
    expect(calls[0]?.params).toEqual(['acc-1', 'ws-1'])
    expect(calls[0]?.sql).toMatch(/ORDER BY i\.updated_at DESC LIMIT 1/)
    expect(calls[0]?.sql).toMatch(/visibility = 'workspace'/)
  })

  it('aucun tier importé → null (critère non évaluable)', async () => {
    const { signals } = build({ tier: null })
    expect(await signals.getTier('acc-1', 'ws-1')).toBeNull()
  })

  it('le niveau décideur est le MEILLEUR (min) des contacts rapprochés aux personas', async () => {
    const { signals } = build({
      personas: [
        { title: 'DSI', decision_level: 1 },
        { title: 'Architecte', decision_level: 3 },
      ],
      contacts: [{ title: 'Architecte solution' }, { title: 'Directeur des systèmes d’information' }, { title: null }],
    })
    expect(await signals.getDecisionLevel('acc-1', 'ws-1')).toBe('Niveau 1')
  })

  it('aucun persona importé → null, sans même lire les contacts', async () => {
    const { signals, calls } = build({ personas: [], contacts: [{ title: 'DSI' }] })
    expect(await signals.getDecisionLevel('acc-1', 'ws-1')).toBeNull()
    expect(calls.some(c => c.sql === 'contacts.find')).toBe(false)
  })

  it('aucun contact rapproché → null (non évaluable, jamais 0)', async () => {
    const { signals } = build({ personas: [{ title: 'DSI', decision_level: 1 }], contacts: [{ title: 'Comptable' }] })
    expect(await signals.getDecisionLevel('acc-1', 'ws-1')).toBeNull()
  })
})
