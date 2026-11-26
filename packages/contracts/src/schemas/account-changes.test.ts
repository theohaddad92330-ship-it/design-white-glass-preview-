import { describe, expect, it } from 'vitest'
import { composeAccountChanges, type AccountChangesInput } from './account-changes.js'
import type { AccountFact } from './account-facts.js'

const ACCOUNT = { id: '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55', name: 'Aubrac Aerostructures' }
const CHECKED = '2026-09-01T00:00:00.000Z'

const fact = (over: Partial<AccountFact>): AccountFact => ({
  date: '2026-09-20',
  kind: 'signal',
  label: 'Un fait',
  weight: 1,
  ageDays: 10,
  ...over,
})

const base = (over: Partial<AccountChangesInput> = {}): AccountChangesInput => ({
  account: ACCOUNT,
  lastCheckedAt: CHECKED,
  facts: [],
  newManagers: [],
  entityChanges: [],
  knownContacts: 12,
  ...over,
})

describe('#4180 — ce qui a changé depuis la dernière vérification', () => {
  it('compare managers, entités, besoins, offres et événements — chacun avec la date du FAIT', () => {
    const changes = composeAccountChanges(
      base({
        facts: [
          fact({ kind: 'hiring', label: '4 ingénieurs PLM', date: '2026-09-15' }),
          fact({ kind: 'need', label: 'Migration PLM documentée', date: '2026-09-10' }),
          fact({ kind: 'signal', label: 'Levée de fonds', date: '2026-09-25' }),
        ],
        newManagers: [
          { label: 'Camille Durand — Directrice technique', date: '2026-09-12', entity: 'Division Avions' },
        ],
        entityChanges: [
          {
            label: 'Paul Martin : Division Hélicoptères → Division Avions',
            date: '2026-09-18',
            entity: 'Division Avions',
          },
        ],
      }),
    )
    expect(changes.status).toBe('changes')
    expect(changes.items.map(i => i.kind).sort()).toEqual([
      'business_event',
      'documented_need',
      'entity_change',
      'hiring_offer',
      'new_manager',
    ])
    // Du plus récent au plus ancien, chaque ligne datée.
    expect(changes.items.map(i => i.date)).toEqual([
      '2026-09-25',
      '2026-09-18',
      '2026-09-15',
      '2026-09-12',
      '2026-09-10',
    ])
    expect(changes.account).toEqual(ACCOUNT)
    expect(changes.lastCheckedAt).toBe(CHECKED)
  })

  it('une offre de recrutement reste une offre RH — jamais un besoin de prestation confirmé', () => {
    const changes = composeAccountChanges(
      base({ facts: [fact({ kind: 'hiring', label: 'Dev Java', date: '2026-09-15' })] }),
    )
    expect(changes.items[0]).toMatchObject({ kind: 'hiring_offer', confirmedNeed: false })
  })

  it('« rien de nouveau » se DIT et n’efface rien : ce qui est connu reste compté', () => {
    const changes = composeAccountChanges(
      base({ facts: [fact({ date: '2026-08-10' }), fact({ date: '2026-07-01', kind: 'need' })] }),
    )
    expect(changes.status).toBe('nothing_new')
    expect(changes.items).toEqual([])
    expect(changes.retained).toEqual({ facts: 2, contacts: 12 })
  })

  it('sans date de dernière vérification, rien n’est comparable : ni « rien de nouveau », ni « 0 »', () => {
    const changes = composeAccountChanges(base({ lastCheckedAt: null, facts: [fact({})] }))
    expect(changes.status).toBe('no_reference')
    expect(changes.items).toEqual([])
    expect(changes.retained).toBeNull()
  })

  it('un fait daté le jour même de la vérification n’est pas nouveau ; celui du lendemain l’est', () => {
    const changes = composeAccountChanges(
      base({ facts: [fact({ date: '2026-09-01', label: 'veille' }), fact({ date: '2026-09-02', label: 'après' })] }),
    )
    expect(changes.items.map(i => i.label)).toEqual(['après'])
  })

  it('les natures hors sujet (notes internes, échanges, corrections) ne sont pas des changements du compte', () => {
    const changes = composeAccountChanges(
      base({
        facts: [
          fact({ kind: 'note', date: '2026-09-20' }),
          fact({ kind: 'exchange', date: '2026-09-20' }),
          fact({ kind: 'correction', date: '2026-09-20' }),
        ],
      }),
    )
    expect(changes.status).toBe('nothing_new')
  })

  it('ne porte aucun champ de provenance', () => {
    const changes = composeAccountChanges(base({ facts: [fact({ kind: 'hiring', date: '2026-09-15' })] }))
    expect(JSON.stringify(changes)).not.toMatch(/source|provider|origin/i)
  })
})
