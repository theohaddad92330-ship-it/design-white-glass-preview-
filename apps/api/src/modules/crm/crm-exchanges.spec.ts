import { buildExchanges } from './crm-exchanges'

const base = { entity_type: 'contact', created: 0, updated: 0, skipped: 0, conflicts: 0, error: null, status: null }

describe('Théo D settings-integrations.N4 — l’historique des échanges', () => {
  it('le plus récent d’abord, borné', () => {
    const rows = [
      { ...base, id: 'a', kind: 'read' as const, provider: 'hubspot', at: new Date('2026-10-20T07:00:00Z') },
      { ...base, id: 'b', kind: 'read' as const, provider: 'hubspot', at: new Date('2026-10-22T08:40:00Z') },
      { ...base, id: 'c', kind: 'read' as const, provider: 'hubspot', at: new Date('2026-10-21T08:40:00Z') },
    ]
    expect(buildExchanges(rows, 2).map(item => item.id)).toEqual(['b', 'c'])
  })

  it('une lecture qui laisse des écarts est « à relire », jamais « fait »', () => {
    const [item] = buildExchanges([
      { ...base, id: 'a', kind: 'read', provider: 'hubspot', at: new Date(), updated: 38, conflicts: 2 },
    ])
    expect(item?.result).toBe('to_review')
    expect(item?.counts).toEqual({ created: 0, updated: 38, skipped: 0, conflicts: 2 })
  })

  it('une écriture est « confirmée » et ne porte pas de comptes', () => {
    const [item] = buildExchanges([
      { ...base, id: 'w', kind: 'write', provider: 'hubspot', at: new Date(), status: 'updated' },
    ])
    expect(item?.result).toBe('confirmed')
    expect(item?.counts).toBeNull()
  })

  it('⚠️ SAIT DIRE NON — un refus garde la raison de l’outil telle quelle, et ne se lit jamais « fait »', () => {
    const rows = [
      { ...base, id: 'r', kind: 'read' as const, provider: 'boondmanager', at: new Date(), error: '401 invalid_grant' },
      {
        ...base,
        id: 'f',
        kind: 'first_sync' as const,
        provider: 'lemlist',
        at: new Date(),
        status: 'failed',
        error: 'clé refusée',
      },
    ]
    const items = buildExchanges(rows)
    expect(items.map(item => item.result)).toEqual(['refused', 'refused'])
    expect(items.map(item => item.detail).sort()).toEqual(['401 invalid_grant', 'clé refusée'])
  })

  it('une première synchro réussie sans écart est « faite »', () => {
    const [item] = buildExchanges([
      {
        ...base,
        id: 's',
        kind: 'first_sync',
        provider: 'lemlist',
        at: new Date(),
        entity_type: '',
        status: 'completed',
      },
    ])
    expect(item?.result).toBe('done')
    expect(item?.entityType).toBeNull()
  })
})
