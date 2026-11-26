import { describe, expect, it } from 'vitest'
import type { SalesProfileForRelevance } from '@bellum/contracts'
import { isOutOfTrade, type WatchlistItem } from '@/features/watchlist/model/watchlist'
import { buildSignalLibrary, type LibraryFilters } from './signal-library'

/**
 * #4403.1 (recette prod 26/10, 38e9fc6e8a) — sur /signals, les 12 premiers signaux ne portaient AUCUN marquage « hors
 * métier » et un signal boursier sur TOTAL arrivait en 6e position, profil IT. `/signals` n'appelait jamais le
 * prédicat que la veille appelle : « hors métier gardé plus bas » (19/10) — on le nomme et on le descend, jamais filtré.
 */
const item = (over: Partial<WatchlistItem>): WatchlistItem => ({
  accountId: 'acc-1',
  companyName: 'Nordia',
  id: 'acc-1-signal-0',
  sector: 'Services',
  signalDate: '2026-10-20',
  signalLabel: 'Projet data annoncé',
  signalSource: 'Communiqué',
  sourceUrl: null,
  sourceKind: null,
  signalType: 'Projet',
  score: 8,
  status: 'new',
  archived: false,
  firstDetectedAt: null,
  firstDetectionExact: false,
  lastSeenAt: null,
  changeCount: 0,
  resolved: false,
  resolvedAt: null,
  importance: null,
  triggeredActionLabel: null,
  lastVerifiedAt: null,
  temporalStatus: null,
  salesImplication: null,
  impact: null,
  logoUrl: null,
  website: null,
  ...over,
})

const NO_FILTERS: LibraryFilters = { tab: 'all', accountIds: new Set(), natures: new Set(), sinceDays: null }
const NOW = Date.parse('2026-10-26T10:00:00Z')
const it_profile: SalesProfileForRelevance = { placedRoles: ['Développeur', 'Data'], noGoSectors: [] }

const bourse = item({
  id: 'bourse',
  companyName: 'TotalEnergies',
  signalDate: '2026-10-25',
  signalType: 'Presse',
  signalLabel: 'Le cours de bourse de TotalEnergies progresse de 2,3 % à Paris',
})
const projet = item({ id: 'projet', signalDate: '2026-10-10', signalLabel: 'Projet data annoncé' })
const rows = (profile?: SalesProfileForRelevance) =>
  buildSignalLibrary([bourse, projet], new Map(), NO_FILTERS, { now: NOW, visible: 10, profile }).rows

describe('#4403.1 — un signal hors métier est nommé et descend', () => {
  it('un cours de bourse est hors métier et passe SOUS un signal de métier plus ancien — rien n’est retiré', () => {
    const out = rows(it_profile)
    expect(out.map(r => r.item.id)).toEqual(['projet', 'bourse'])
    expect(out.find(r => r.item.id === 'bourse')?.outOfTrade).toBe(true)
  })

  it('le tri ne dépend pas de la présence du profil : le cours de bourse n’est un recrutement pour personne', () => {
    expect(rows(undefined).map(r => r.item.id)).toEqual(['projet', 'bourse'])
  })

  it('sait dire NON : un signal de métier n’est jamais marqué, ni une levée de fonds ni une introduction en bourse', () => {
    const levee = item({ id: 'levee', signalType: 'Levée de fonds', signalLabel: 'Nordia lève 20 M€ en série B' })
    const ipo = item({ id: 'ipo', signalType: 'Financement', signalLabel: 'Nordia prépare son introduction en bourse' })
    const offre = item({ id: 'offre', signalType: 'Recrutement', signalLabel: 'Développeur Java confirmé H/F' })
    for (const signal of [projet, levee, ipo, offre]) expect(isOutOfTrade(signal, it_profile)).toBe(false)
    const out = buildSignalLibrary([levee, ipo, offre, projet], new Map(), NO_FILTERS, {
      now: NOW,
      visible: 10,
      profile: it_profile,
    }).rows
    expect(out).toHaveLength(4)
    expect(out.every(r => r.outOfTrade === false)).toBe(true)
  })
})
