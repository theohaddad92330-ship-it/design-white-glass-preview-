import { describe, expect, it } from 'vitest'
import { applyHiringDomain, groupWatchlistByAccount, type WatchlistItem } from './watchlist'

// #3901.w — /mes-cibles suit le profil déclaré comme Découvrir (mêmes fonctions, GA-26).
// #4088.7 — l'offre HORS domaine n'est plus « rangée en fin » : elle est ÉCARTÉE (discardReason).
const item = (id: string, signalType: string, signalLabel: string): WatchlistItem =>
  ({
    accountId: id,
    id: `s-${id}`,
    companyName: id,
    sector: '',
    score: null,
    signalDate: '2026-10-01',
    signalType,
    signalLabel,
    archived: false,
    status: 'new',
    importance: null,
    decisionMaker: null,
  }) as unknown as WatchlistItem

const cyber = { placedRoles: ['cybersécurité'], noGoSectors: [] }
const vide = { placedRoles: [], noGoSectors: [] }
const items = [
  item('Chantier', 'Recrutement', 'Recrutement — Ingénieur HSE'),
  item('Levée', 'Levée de fonds', 'Série B'),
  item('Sécu', 'Recrutement', 'Recrutement IT — Analyste cybersécurité'),
]

describe('#3901.w — Mes cibles : recrutements selon le profil déclaré', () => {
  it('ESN cyber : le libellé porte le domaine, l’offre HSE reste listée, rangée plus bas et marquée (#4284.10)', () => {
    const out = applyHiringDomain(items, cyber)
    expect(out.items.map(i => i.accountId)).toEqual(['Chantier', 'Levée', 'Sécu'])
    expect(out.items[2]?.displayLabel).toBe('Recrutement cybersécurité — Analyste cybersécurité')
    expect(out.notice).toEqual({ kind: 'offDomain', count: 1 })
    const groups = groupWatchlistByAccount(out.items, cyber)
    const reasons = new Map(groups.map(g => [g.accountId, g.discardReason]))
    // #4284.10 (recette 21/10, L2a) — hors métier = JAMAIS écarté : rang bas + marque « hors de ton métier ».
    expect(reasons.get('Chantier')).toBeNull()
    expect(reasons.get('Sécu')).toBeNull()
    expect(reasons.get('Levée')).toBeNull()
    expect(groups.find(g => g.accountId === 'Chantier')?.outOfTrade).toBe(true)
    expect(groups.find(g => g.accountId === 'Sécu')?.outOfTrade).toBe(false)
    expect(groups.map(g => g.accountId).at(-1)).toBe('Chantier')
  })

  it('NON : l’offre HSE garde son libellé, la levée de fonds n’est jamais réétiquetée', () => {
    const out = applyHiringDomain(items, cyber)
    const byId = new Map(out.items.map(i => [i.accountId, i.displayLabel]))
    expect(byId.get('Chantier')).toBe('Recrutement — Ingénieur HSE')
    expect(byId.get('Levée')).toBe('Série B')
  })

  it('NON : la donnée source n’est jamais mutée (l’action « vérifier » envoie le libellé d’origine)', () => {
    applyHiringDomain(items, cyber)
    expect(items[2]?.signalLabel).toBe('Recrutement IT — Analyste cybersécurité')
    expect(items[2]?.displayLabel).toBeUndefined()
  })

  it('profil vide : libellés d’avant, la ligne renvoie vers Mon profil, aucune offre n’est un signal fort (#3901.p)', () => {
    const out = applyHiringDomain(items, vide)
    expect(out.items[2]?.displayLabel).toBe('Recrutement IT — Analyste cybersécurité')
    expect(out.notice).toMatchObject({ kind: 'noRoles' })
    // #4284.10 — sans profil déclaré on ne marque RIEN (« hors de ton métier » exige un métier à comparer).
    const groups = groupWatchlistByAccount(out.items, vide)
    expect(groups.filter(g => g.outOfTrade).length).toBe(0)
  })

  it('profil pas chargé : rien ne change, aucune ligne', () => {
    const out = applyHiringDomain(items, undefined)
    expect(out.items.map(i => i.accountId)).toEqual(['Chantier', 'Levée', 'Sécu'])
    expect(out.notice).toBeNull()
  })
})
