import { describe, expect, it } from 'vitest'
import type { WatchSignal } from './watch'
import { distinctWatchEvents } from './watchEvents'

const sig = (over: Partial<WatchSignal>): WatchSignal => ({
  id: 's',
  category: 'budget',
  date: '2026-09-04',
  freshness: 'current',
  temporalStatus: 'RECENT',
  type: 'Budget',
  signal: 'Budget cloud annoncé',
  source: 'Les Echos',
  angles: [],
  actionGate: { allowed: true },
  tags: [],
  perimeter: 'ACME',
  ...over,
})

describe('distinctWatchEvents — #3680.1', () => {
  it('deux articles sur le même événement ne font qu’un signal, les sources se joignent', () => {
    const out = distinctWatchEvents([
      sig({ id: 'a', source: 'Les Echos' }),
      sig({ id: 'b', source: 'LeMagIT', signal: 'Budget  Cloud annoncé !' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.source).toBe('Les Echos · LeMagIT')
  })
  it('une autre date ou une autre catégorie reste un autre événement', () => {
    expect(distinctWatchEvents([sig({ id: 'a' }), sig({ id: 'b', date: '2026-09-05' })])).toHaveLength(2)
    expect(distinctWatchEvents([sig({ id: 'a' }), sig({ id: 'b', category: 'historique' })])).toHaveLength(2)
  })
  it('un signal non daté ne fusionne jamais', () => {
    const undated = { date: '', freshness: 'undated' as const }
    expect(distinctWatchEvents([sig({ id: 'a', ...undated }), sig({ id: 'b', ...undated })])).toHaveLength(2)
  })
})

describe('distinctWatchEvents — #3916 le lien source survit au doublon', () => {
  it('le doublon qui porte le lien COMPLÈTE le signal retenu sans lien', () => {
    const out = distinctWatchEvents([
      sig({ id: 'a', sourceUrl: null, sourceKind: null }),
      sig({ id: 'b', source: 'BODACC', sourceUrl: 'https://www.bodacc.fr/a/1', sourceKind: 'bodacc' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.sourceUrl).toBe('https://www.bodacc.fr/a/1')
    expect(out[0]?.sourceKind).toBe('bodacc')
  })
})

describe('distinctWatchEvents — #4142 (R25) deux signaux quasi identiques', () => {
  const a = 'Veolia investit dans Mistral AI'
  const b = 'Veolia investit dans Mistral AI pour déployer l’IA générative'
  it('même catégorie, même date, libellé recouvert : un seul signal, les sources se joignent', () => {
    const out = distinctWatchEvents([
      sig({ id: 'a', signal: a, source: 'Les Echos' }),
      sig({ id: 'b', signal: b, source: 'LeMagIT' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.source).toBe('Les Echos · LeMagIT')
  })
  it('une autre date, une autre catégorie ou un autre objet reste un autre signal', () => {
    expect(distinctWatchEvents([sig({ signal: a }), sig({ id: 'b', signal: b, date: '2026-09-05' })])).toHaveLength(2)
    expect(distinctWatchEvents([sig({ signal: a }), sig({ id: 'b', signal: b, category: 'historique' })])).toHaveLength(
      2,
    )
    expect(
      distinctWatchEvents([sig({ signal: a }), sig({ id: 'b', signal: 'Veolia recrute un directeur des achats' })]),
    ).toHaveLength(2)
  })
})

// #recette-21-10-K3 — fiche Veolia : chaque offre d'emploi s'affichait trois fois.
describe('distinctWatchEvents — recette 21/10 K3 : les offres au même intitulé se replient', () => {
  const offer = (over: Partial<WatchSignal>): WatchSignal =>
    sig({ category: 'recrutement', type: 'Offre', sourceKind: 'job', source: 'France Travail', ...over })

  it('deux offres « Senior Consultant Stratégie DATA / IA » (Toulouse, Aix) ne font qu’une ligne', () => {
    const out = distinctWatchEvents([
      offer({ id: 'a', signal: 'Senior Consultant Stratégie DATA / IA', date: '2026-10-01', location: 'Toulouse' }),
      offer({
        id: 'b',
        signal: 'Senior consultant Stratégie Data et IA',
        date: '2026-10-09',
        location: 'Aix-en-Provence',
      }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ offerCount: 2, offerPlaces: ['Toulouse', 'Aix-en-Provence'] })
  })

  it('K3 22/10 — trois offres d’une source « offre d’emploi » SANS source_kind=job : une ligne, 3 annonces', () => {
    const viaSource = (id: string, location: string) =>
      offer({
        id,
        type: 'signal',
        sourceKind: null,
        source: 'Offre d’emploi · Welcome to the Jungle',
        signal: 'Measurement and Data Marketing Manager',
        date: '2026-10-03',
        location,
      })
    const out = distinctWatchEvents([viaSource('a', 'Lille'), viaSource('b', 'Paris'), viaSource('c', 'Lyon')])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ offerCount: 3, offerPlaces: ['Lille', 'Paris', 'Lyon'] })
  })

  it('un même intitulé hors offre d’emploi ne se replie pas en « offres »', () => {
    const out = distinctWatchEvents([
      sig({ id: 'a', signal: 'Nomination du DSI', date: '2026-10-01' }),
      sig({ id: 'b', signal: 'Nomination du DSI', date: '2026-10-09' }),
    ])
    expect(out).toHaveLength(2)
    expect(out.every(event => event.offerCount === undefined)).toBe(true)
  })

  it('deux intitulés différents restent deux offres', () => {
    const out = distinctWatchEvents([
      offer({ id: 'a', signal: 'Architecte cloud', location: 'Paris' }),
      offer({ id: 'b', signal: 'Data engineer', location: 'Paris' }),
    ])
    expect(out).toHaveLength(2)
  })

  it('deux articles de bourse du même jour, au titre égal hors nom du média, ne font qu’un signal', () => {
    const out = distinctWatchEvents([
      sig({
        id: 'a',
        category: 'historique',
        signal: 'Veolia : le titre gagne 2 % à la Bourse de Paris - Boursorama',
        source: 'Boursorama',
      }),
      sig({
        id: 'b',
        category: 'historique',
        signal: 'Veolia : le titre gagne 2 % à la Bourse de Paris - Zonebourse',
        source: 'Zonebourse',
      }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.source).toBe('Boursorama · Zonebourse')
  })
})
