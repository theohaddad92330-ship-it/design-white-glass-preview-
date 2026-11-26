import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import {
  buildWatchlistItems,
  countWatchlistTypeFacets,
  effectiveTypeFacets,
  filterWatchlistByTypes,
  groupWatchlistByAccount,
  signalTypeFacet,
  WATCHLIST_TYPE_FACETS,
  type WatchlistTypeFacet,
} from './watchlist'

/** #4088.10 — filtrer par TYPE de signal : OU entre types, comptes comptés, signal le plus fort DE CE TYPE. */
const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const A3 = '33333333-3333-4333-8333-333333333333'
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)

const signal = (overrides: Partial<AccountSignalItem>): AccountSignalItem => ({
  id: 's',
  account_id: A1,
  account_created_at: day(200),
  account_score: 8,
  company_name: 'Nordia',
  date: day(3),
  label: 'Programme data',
  sector: 'Services',
  source: 'Communiqué',
  type: 'Recrutement',
  ...overrides,
})

const items = () =>
  buildWatchlistItems([
    signal({ id: 'h1', account_id: A1, type: 'Recrutement', label: 'Recrute 12 data engineers', date: day(1) }),
    signal({ id: 'm1', account_id: A1, type: 'acquisition', label: 'Nordia rachète Alpha', date: day(30) }),
    signal({ id: 'h2', account_id: A2, company_name: 'Orbis', type: 'Recrutement', label: 'Recrute un DSI' }),
    signal({ id: 'o1', account_id: A3, company_name: 'Vexa', type: 'Météo', label: 'Canicule' }),
    signal({
      id: 'g1',
      account_id: A3,
      company_name: 'Vexa',
      type: 'Presse',
      label: 'Inflation : le marché attentiste',
    }),
  ])

describe('#4088.10 — puces de type de signal', () => {
  it('les six types, dont « Autres » ; un signal écarté n’est d’aucun type', () => {
    expect([...WATCHLIST_TYPE_FACETS]).toEqual(['hiring', 'mna', 'exec', 'funding', 'tender', 'other'])
    expect(signalTypeFacet({ signalType: 'Recrutement', signalLabel: 'Alternance data' }, undefined)).toBeNull()
    expect(signalTypeFacet({ signalType: 'Météo', signalLabel: 'Canicule' }, undefined)).toBe('other')
    expect(signalTypeFacet({ signalType: 'Presse', signalLabel: 'Inflation' }, undefined)).toBeNull()
  })

  it('compte les COMPTES (pas les signaux) ; une puce à 0 vaut 0 et n’est pas appliquée', () => {
    const counts = countWatchlistTypeFacets(items(), undefined)
    expect(counts).toEqual({ hiring: 2, mna: 1, exec: 0, funding: 0, tender: 0, other: 1 })
    const applied = effectiveTypeFacets(new Set<WatchlistTypeFacet>(['exec', 'mna']), counts)
    expect([...applied]).toEqual(['mna'])
  })

  it('OU entre types : recrutement + autres → trois comptes ; un seul type → ses comptes', () => {
    const all = items()
    const accounts = (types: WatchlistTypeFacet[]) =>
      [...new Set(filterWatchlistByTypes(all, new Set(types), undefined).map(i => i.accountId))].sort()
    expect(accounts(['hiring'])).toEqual([A1, A2])
    expect(accounts(['hiring', 'other'])).toEqual([A1, A2, A3])
    expect(accounts([])).toEqual([A1, A2, A3])
    expect(accounts(['tender'])).toEqual([])
  })

  it('type filtré → le signal le plus fort DE CE TYPE en tête, le reste dans « +N autres »', () => {
    const typed = filterWatchlistByTypes(items(), new Set<WatchlistTypeFacet>(['mna']), undefined)
    const [group] = groupWatchlistByAccount(typed, undefined, new Set<WatchlistTypeFacet>(['mna']))
    expect(group?.latest.id).toBe('m1')
    expect(group?.others.map(i => i.id)).toEqual(['h1'])
    // Sans type, le recrutement plus récent reste en tête.
    const [plain] = groupWatchlistByAccount(
      items().filter(i => i.accountId === A1),
      undefined,
    )
    expect(plain?.latest.id).toBe('h1')
  })
})
