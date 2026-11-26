import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import { buildWatchlistItems } from './watchlist'
import { buildLibraryView, EMPTY_LIBRARY_STATE, natureOf, type LibraryMarks, type LibraryState } from './signal-library'
import { withSaved, withTrashed } from './signal-library-marks'

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-10-23T08:00:00Z')
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString().slice(0, 10)

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

const items = buildWatchlistItems([
  signal({ id: 'a', date: day(2), label: 'Deux postes SAP à pourvoir' }),
  signal({
    id: 'b',
    account_id: A2,
    company_name: 'Orbis',
    date: day(40),
    type: 'Nomination',
    label: 'Nouveau directeur général nommé',
  }),
  signal({
    id: 'c',
    account_id: A2,
    company_name: 'Orbis',
    date: day(10),
    type: 'appel_offres',
    label: 'Consultation tierce maintenance',
  }),
  signal({ id: 'd', date: day(5), type: 'Recrutement', label: 'Offre de stage en data' }),
])
const none: LibraryMarks = { saved: new Set(), trashed: new Set() }
const view = (state: Partial<LibraryState> = {}, marks: LibraryMarks = none) =>
  buildLibraryView(items, { ...EMPTY_LIBRARY_STATE, ...state }, marks, undefined, NOW)
const ids = (state: Partial<LibraryState> = {}, marks: LibraryMarks = none) => view(state, marks).items.map(i => i.id)

describe('signal-library — la bibliothèque de signaux (Théo signaux)', () => {
  it('« Tous » est plat, du plus récent au plus ancien, sans le bruit reconnu', () => {
    expect(ids()).not.toContain('d')
    const all = view().items
    expect(all.map(i => i.id)).toEqual(
      [...all].sort((x, y) => Date.parse(y.signalDate) - Date.parse(x.signalDate)).map(i => i.id),
    )
  })

  it('l’onglet Écartés porte le bruit (stage), jamais supprimé', () => {
    expect(ids({ tab: 'dismissed' })).toEqual(['d'])
    expect(view().tabCounts.dismissed).toBe(1)
  })

  it('filtre par compte, nature et date du fait', () => {
    expect(ids({ accountIds: new Set([A2]) }).every(id => ['b', 'c'].includes(id))).toBe(true)
    const tender = items.find(i => i.id === 'c')!
    expect(ids({ natures: new Set([natureOf(tender)]) })).toContain('c')
    expect(ids({ days: 7 })).toEqual(['a'])
    expect(ids({ days: 30 })).not.toContain('b')
    expect(ids({ days: 90 })).toContain('b')
  })

  it('l’ordre « plus anciens » inverse le tri', () => {
    const recent = ids()
    expect(ids({ sort: 'oldest' })).toEqual([...recent].reverse())
  })

  it('SAIT DIRE NON : un signal enregistré n’apparaît sous Enregistrés que s’il l’a été, la corbeille le retire de Tous', () => {
    expect(ids({ tab: 'saved' })).toEqual([])
    const saved = withSaved(none, ['a'], true)
    expect(ids({ tab: 'saved' }, saved)).toEqual(['a'])
    const trashed = withTrashed(saved, ['a'], true)
    expect(ids({}, trashed)).not.toContain('a')
    expect(ids({ tab: 'saved' }, trashed)).toEqual([])
    expect(ids({ tab: 'trash' }, trashed)).toEqual(['a'])
    // restaurer : la corbeille se vide, le signal revient
    expect(ids({ tab: 'trash' }, withTrashed(trashed, ['a'], false))).toEqual([])
    expect(ids({}, withTrashed(trashed, ['a'], false))).toContain('a')
  })

  it('les comptes de la puce ne listent que les comptes qui portent un signal de l’onglet', () => {
    expect(
      view()
        .accounts.map(a => a.id)
        .sort(),
    ).toEqual([A1, A2].sort())
    expect(view({ tab: 'saved' }).accounts).toEqual([])
  })
})
