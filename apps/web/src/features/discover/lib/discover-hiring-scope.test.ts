import { describe, expect, it } from 'vitest'
import { headerCounts } from './discover-list-window'
import { hiringScopeNotice, outOfTradeLast, scopeDiscoverHiring } from './discover-hiring-domain'
import type { DiscoverCandidate, DiscoverSignal } from './discover-types'

// #3901.p — décision Louis 16/10/2026 (capture prod, carte LA POSTE) : une offre HORS des métiers de l'ESN
// ne s'affiche pas, ne pèse pas, et un compte qui n'a plus que ça ne remonte pas « au titre du recrutement ».
const hiring = (label: string): DiscoverSignal => ({ type: 'hiring', date: '2026-10-10', label })
const account = (
  name: string,
  ...signals: DiscoverSignal[]
): { name: string; signals: DiscoverSignal[]; outOfTrade?: boolean } => ({
  name,
  signals,
})

const esnItDeduite = {
  placedRoles: [],
  noGoSectors: [],
  inferredPlacedRoles: [{ role: 'Développeur', terms: ['developpeur', 'devops', 'data engineer'] }],
}
const esnIndustrie = { placedRoles: ['Ingénieur HSE'], noGoSectors: [] }
const muet = { placedRoles: [], noGoSectors: [] }

const laPoste = account(
  'LA POSTE',
  hiring('CDD Facteur Villaines-La-Juhel H/F'),
  hiring('CDD Factrice ou Facteur H/F'),
  hiring('CDD Facteur H/F'),
  hiring('Conseiller en Service Relation Client H/F'),
)

describe('#3901.p — scopeDiscoverHiring', () => {
  // #4284.26 (décision 22, Louis 19/10) — RENVERSE « le compte ne remonte pas » : un compte hors du métier de
  // l'espace n'est JAMAIS écarté ; il reste, SANS ses offres, marqué `outOfTrade`, après les autres.
  it('LA POSTE, ESN IT déduite : zéro offre affichée, le compte reste en dernier, marqué « hors métier »', () => {
    const scoped = scopeDiscoverHiring([laPoste, account('ACME', hiring('Développeur Java H/F'))], esnItDeduite, {
      dropEmpty: true,
    })
    expect(scoped.items.map(item => item.name)).toEqual(['ACME', 'LA POSTE'])
    expect(scoped.items.map(item => item.outOfTrade === true)).toEqual([false, true])
    expect(scoped.items[1]!.signals).toEqual([])
    expect(scoped.hidden).toBe(4)
  })

  it('un compte hors métier ne disparaît JAMAIS : autant de comptes en sortie qu’en entrée', () => {
    const input = [laPoste, account('ACME', hiring('Développeur Java H/F')), account('Vide')]
    expect(scopeDiscoverHiring(input, esnItDeduite, { dropEmpty: true }).items).toHaveLength(input.length)
  })

  it('outOfTradeLast : après un tri quelconque, les comptes hors métier passent après les autres (ordre stable)', () => {
    const rows = [
      { name: 'A', signals: [], outOfTrade: true },
      { name: 'B', signals: [] },
      { name: 'C', signals: [], outOfTrade: true },
      { name: 'D', signals: [] },
    ]
    expect(outOfTradeLast(rows).map(r => r.name)).toEqual(['B', 'D', 'A', 'C'])
  })

  it('recherche par secteur (pas « recrutement » seul) : le compte reste, SANS ses offres facteur', () => {
    const withTender = {
      ...laPoste,
      signals: [...laPoste.signals, { type: 'tender', date: '2026-10-01', label: 'AO' } as DiscoverSignal],
    }
    const scoped = scopeDiscoverHiring([withTender], esnItDeduite, { dropEmpty: false })
    expect(scoped.items).toHaveLength(1)
    expect(scoped.items[0]!.signals.map(s => s.type)).toEqual(['tender'])
  })

  // #4284.26 — l'APPELANT : hors « Comptes qui recrutent » (`dropEmpty: false`), un compte dont il ne reste que des
  // offres hors métier était listé SANS marque. Il reste listé, plus bas, et se DIT ; sans métier connu, rien.
  it('recherche ordinaire : le compte qui n’a que des offres hors métier reste listé, marqué, après les autres', () => {
    const scoped = scopeDiscoverHiring([laPoste, account('ACME', hiring('Développeur Java H/F'))], esnItDeduite, {
      dropEmpty: false,
    })
    expect(scoped.items.map(item => [item.name, item.outOfTrade === true])).toEqual([
      ['ACME', false],
      ['LA POSTE', true],
    ])
  })

  it('recherche ordinaire : métier inconnu ou compte sans signal ⇒ jamais marqué', () => {
    const muetScoped = scopeDiscoverHiring([account('ACME', hiring('Développeur Java H/F'))], muet, {
      dropEmpty: false,
    })
    expect(muetScoped.items.map(item => item.outOfTrade)).toEqual([undefined])
    const sansSignal = scopeDiscoverHiring([account('VIDE')], esnItDeduite, { dropEmpty: false })
    expect(sansSignal.items.map(item => item.outOfTrade)).toEqual([undefined])
  })

  it('une ESN industrie garde ses offres industrie et perd les offres IT', () => {
    const scoped = scopeDiscoverHiring(
      [account('Chantier SA', hiring('Ingénieur HSE chantier'), hiring('Développeur Java H/F'))],
      esnIndustrie,
      { dropEmpty: true },
    )
    expect(scoped.items[0]!.signals.map(s => s.label)).toEqual(['Ingénieur HSE chantier'])
  })

  it('profil muet : aucune offre n’est un signal fort, et la ligne le DIT', () => {
    const scoped = scopeDiscoverHiring([account('ACME', hiring('Développeur Java H/F'))], muet, { dropEmpty: true })
    expect(scoped.items.map(item => item.outOfTrade)).toEqual([true]) // #4284.26 : gardé, marqué
    expect(hiringScopeNotice(muet, scoped.hidden)).toEqual({ kind: 'noRoles' })
  })

  it('profil pas encore chargé : seul un poste clairement non placé sort, aucune ligne', () => {
    const scoped = scopeDiscoverHiring([laPoste, account('ACME', hiring('Développeur Java H/F'))], undefined, {
      dropEmpty: true,
    })
    expect(scoped.items.map(item => item.name)).toEqual(['ACME', 'LA POSTE'])
    expect(hiringScopeNotice(undefined, scoped.hidden)).toBeNull()
  })

  it('un placeur en CDI garde toute ouverture… sauf un poste non placé', () => {
    const placeur = { placedRoles: [], noGoSectors: [], recruitsForClients: true }
    const scoped = scopeDiscoverHiring([account('X', hiring('Responsable RH'), hiring('Livreur H/F'))], placeur, {
      dropEmpty: true,
    })
    expect(scoped.items[0]!.signals.map(s => s.label)).toEqual(['Responsable RH'])
    expect(hiringScopeNotice(placeur, 1)).toBeNull()
  })
})

describe('#3901.p — compteurs d’en-tête sur la MÊME liste (M ≤ N)', () => {
  const candidate = (name: string, score: number | null, unmeasured: string[] = []): DiscoverCandidate =>
    ({ name, score, scoreMax: 100, scoreUnmeasured: unmeasured, signals: [] }) as unknown as DiscoverCandidate

  it('« 10 affichées dont 15 à fort potentiel » est impossible', () => {
    const fifteenStrong = Array.from({ length: 15 }, (_, i) => candidate(`C${i}`, 95))
    const counts = headerCounts(fifteenStrong, 10)
    expect(counts.shown).toBe(10)
    expect(counts.highPotential).toBeLessThanOrEqual(counts.shown)
  })

  it.each([0, 1, 5, 10, 25])('M ≤ N pour une fenêtre de %i', window => {
    const list = Array.from({ length: 12 }, (_, i) => candidate(`C${i}`, i % 2 === 0 ? 95 : 10))
    const counts = headerCounts(list, window)
    expect(counts.highPotential).toBeLessThanOrEqual(counts.shown)
  })
})
