import { describe, expect, it } from 'vitest'
import type { AccountSignalItem, SalesProfileForRelevance } from '@bellum/contracts'
import { buildWatchlistItems } from './watchlist'
import { buildLibraryView, EMPTY_LIBRARY_STATE } from './signal-library'

/**
 * #4403.1 (recette prod 23/10, reprise 25/10) — la bibliothèque de signaux (Mes cibles › Signaux) lisait le profil
 * mais ne rangeait rien : une offre hors du métier de l'ESN restait au rang de sa date. Elle passe APRÈS les offres
 * du métier, SANS rien retirer (on étiquette et on range).
 */
const NOW = Date.parse('2026-10-25T08:00:00Z')
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString().slice(0, 10)
const cyber: SalesProfileForRelevance = { placedRoles: ['Cybersécurité'], noGoSectors: [] }

const signal = (overrides: Partial<AccountSignalItem>): AccountSignalItem => ({
  id: 's',
  account_id: '11111111-1111-4111-8111-111111111111',
  account_created_at: day(200),
  account_score: 8,
  company_name: 'Nordia',
  date: day(3),
  label: 'x',
  sector: 'Services',
  source: 'Offre',
  type: 'Recrutement',
  ...overrides,
})

const items = buildWatchlistItems([
  signal({ id: 'off1', date: day(1), label: 'Chef d’équipe' }),
  signal({ id: 'in1', date: day(4), label: 'Analyste SOC N2' }),
  signal({ id: 'off2', date: day(2), label: 'Technicien maintenance PRINT' }),
  signal({ id: 'in2', date: day(6), label: 'Consultant cybersécurité confirmé' }),
])
const none = { saved: new Set<string>(), trashed: new Set<string>() }
const ids = (profile?: SalesProfileForRelevance) =>
  buildLibraryView(items, EMPTY_LIBRARY_STATE, none, profile, NOW).items.map(i => i.id)

describe('#4403.1 — la bibliothèque range les offres hors métier plus bas', () => {
  it('les offres du métier en tête (par date), les hors métier après — aucune retirée', () => {
    expect(ids(cyber)).toEqual(['in1', 'in2', 'off1', 'off2'])
  })

  it('SAIT DIRE NON — profil non lu : l’ordre reste celui de la date', () => {
    expect(ids(undefined)).toEqual(['off1', 'off2', 'in1', 'in2'])
  })
})
