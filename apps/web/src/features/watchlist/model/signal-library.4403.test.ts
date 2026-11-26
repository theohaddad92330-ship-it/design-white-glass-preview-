import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import { buildWatchlistItems, isOutOfTrade } from './watchlist'
import { buildLibraryView, EMPTY_LIBRARY_STATE, type LibraryMarks, type LibraryState } from './signal-library'

// #4403.1 (recette prod 25/10) — /signals : 1397 signaux, les trois premiers (Darty, CH Valenciennes, BNP) ne sont
// pas IT. Les signaux du métier de l'ESN passent en tête, le « hors métier » se marque ; rien n'est filtré.
const NOW = Date.parse('2026-10-25T08:00:00Z')
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString().slice(0, 10)
const sig = (n: number, company: string, label: string, offset: number): AccountSignalItem => ({
  id: `s${n}`,
  account_id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`,
  account_created_at: day(200),
  account_score: 8,
  company_name: company,
  date: day(offset),
  label,
  sector: 'Services',
  source: 'Offre',
  type: 'Recrutement',
})
const profilIt = { placedRoles: ['développeur', 'data engineer'], noGoSectors: [] }
const none: LibraryMarks = { saved: new Set(), trashed: new Set() }
const items = buildWatchlistItems([
  sig(1, 'Darty', 'CDD Hôte de vente H/F', 1),
  sig(2, 'CH Valenciennes', 'CDD Facteur H/F', 2),
  sig(3, 'Sopra', 'Développeur Java H/F', 6),
  sig(4, 'Alten', 'Data engineer H/F', 9),
])
const view = (state: Partial<LibraryState> = {}) =>
  buildLibraryView(items, { ...EMPTY_LIBRARY_STATE, ...state }, none, profilIt, NOW)
const names = (state: Partial<LibraryState> = {}) => view(state).items.map(i => i.companyName)

describe('signal-library — l’ordre suit le métier de l’ESN (#4403.1)', () => {
  it('par défaut, les signaux du métier passent en tête, le hors métier suit — et rien n’est retiré', () => {
    expect(names()).toEqual(['Sopra', 'Alten', 'Darty', 'CH Valenciennes'])
  })

  it('SAIT DIRE NON : « Plus récents » reste l’ordre pur des dates, sans réordonner par métier', () => {
    expect(names({ sort: 'recent' })).toEqual(['Darty', 'CH Valenciennes', 'Sopra', 'Alten'])
  })

  it('le hors métier se reconnaît par le même prédicat que /mes-cibles', () => {
    const flags = view().items.map(i => [i.companyName, isOutOfTrade(i, profilIt)])
    expect(flags).toEqual([
      ['Sopra', false],
      ['Alten', false],
      ['Darty', true],
      ['CH Valenciennes', true],
    ])
  })
})
