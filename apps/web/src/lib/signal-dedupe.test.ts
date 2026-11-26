import { describe, expect, it } from 'vitest'
import {
  SIGNAL_TEXT_SIMILARITY_THRESHOLD,
  dedupeSignals,
  foldSameTitleOffers,
  isJobOffer,
  signalTextSimilarity,
  type DedupableSignal,
} from './signal-dedupe'

// #4142 — dédoublonner AU RENDU : même fait, deux formulations ⇒ une seule ligne, la plus riche gardée.
const read = (signal: DedupableSignal) => signal

const A: DedupableSignal = {
  text: 'Veolia lance un appel d’offres cloud pour sa DSI',
  url: 'https://www.lemagit.fr/actualites/veolia-cloud',
  date: '2026-09-10',
  detail: null,
}
const A_BIS: DedupableSignal = {
  text: 'Appel d’offres cloud lancé par Veolia pour sa DSI',
  url: 'https://www.lemagit.fr/actualites/veolia-cloud?utm_source=x',
  date: '2026-09-11',
  detail: 'Budget de 12 M€ sur trois ans, attribution prévue au premier trimestre.',
}

describe('dedupeSignals (#4142)', () => {
  it('deux formulations du même fait (même lien, jour voisin) : UNE ligne, la plus riche gardée', () => {
    expect(dedupeSignals([A, A_BIS], read)).toEqual([A_BIS])
  })

  it('texte très proche sans lien commun, même date : une seule ligne', () => {
    const rewording = { ...A_BIS, url: null, date: '2026-09-10', detail: null }
    const plain = { ...A, url: null, detail: null }
    expect(dedupeSignals([plain, rewording], read)).toHaveLength(1)
  })

  it('⚠️ SAIT DIRE NON — deux faits DISTINCTS le même jour restent deux lignes', () => {
    const other: DedupableSignal = {
      text: 'Veolia nomme un nouveau directeur des achats IT',
      url: 'https://www.lesechos.fr/veolia-nomination',
      date: '2026-09-10',
      detail: null,
    }
    expect(dedupeSignals([A, other], read)).toEqual([A, other])
  })

  it('⚠️ SAIT DIRE NON — le même lien à deux mois d’écart : deux faits', () => {
    expect(dedupeSignals([A, { ...A_BIS, date: '2026-11-20' }], read)).toHaveLength(2)
  })

  it('⚠️ SAIT DIRE NON — le même texte à deux mois d’écart : un fait qui se répète, pas un doublon', () => {
    expect(dedupeSignals([A, { ...A, date: '2026-11-20' }], read)).toHaveLength(2)
  })

  it('une date inconnue n’autorise jamais la fusion par le lien (rien n’est deviné)', () => {
    expect(dedupeSignals([A, { ...A_BIS, text: 'Tout autre sujet', date: null }], read)).toHaveLength(2)
  })

  it('l’ordre est conservé : la ligne riche prend la place de la première occurrence', () => {
    const middle: DedupableSignal = { text: 'Veolia ouvre un site à Lyon', url: null, date: '2026-08-01', detail: null }
    expect(dedupeSignals([A, middle, A_BIS], read)).toEqual([A_BIS, middle])
  })

  it('« même source seulement » (Enjeux à adresser) : un texte proche sans source commune reste en double', () => {
    const one: DedupableSignal = { text: A.text, url: null, date: null, detail: null }
    const two: DedupableSignal = { text: A_BIS.text, url: null, date: null, detail: null }
    expect(dedupeSignals([one, two], read, { sameSourceOnly: true })).toHaveLength(2)
    expect(dedupeSignals([A, A_BIS], read, { sameSourceOnly: true })).toEqual([A_BIS])
  })

  it('le seuil est NOMMÉ, en un seul endroit, et sépare les deux formulations des deux faits distincts', () => {
    expect(signalTextSimilarity(A.text, A_BIS.text)).toBeGreaterThanOrEqual(SIGNAL_TEXT_SIMILARITY_THRESHOLD)
    expect(signalTextSimilarity(A.text, 'Veolia nomme un nouveau directeur des achats IT')).toBeLessThan(
      SIGNAL_TEXT_SIMILARITY_THRESHOLD,
    )
  })
})

describe('foldSameTitleOffers — #4294.10 (#4142.5)', () => {
  const offer = (signal: string, location: string) => ({ signal, location, source_kind: 'job', date: '2026-10-10' })

  it('cas réel Thales : même intitulé normalisé (casse, « / » vs « et »), deux villes → UNE ligne avec ses villes', () => {
    const folded = foldSameTitleOffers([
      offer('Senior Consultant Stratégie DATA / IA', 'Toulouse'),
      offer('Senior consultant Stratégie Data et IA', 'Aix'),
    ])
    expect(folded).toHaveLength(1)
    expect(folded[0]?.offerPlaces).toEqual(['Toulouse', 'Aix'])
    expect(folded[0]?.offerCount).toBe(2)
  })

  it('⚠️ SAIT DIRE NON — deux intitulés différents ne se replient pas ; un signal non-offre non plus', () => {
    expect(
      foldSameTitleOffers([offer('Architecte cloud', 'Lyon'), offer('Chef de projet cloud', 'Lyon')]),
    ).toHaveLength(2)
    const press = { signal: 'Veolia ouvre un site', location: 'Lyon', source_kind: 'press', date: '2026-10-10' }
    expect(foldSameTitleOffers([press, { ...press }])).toHaveLength(2)
  })

  it('une offre seule reste telle quelle, sans compteur', () => {
    const folded = foldSameTitleOffers([offer('Architecte cloud', 'Lyon')])
    expect(folded[0]?.offerCount).toBeUndefined()
  })
})

// K3 / recette 22/10 (Decathlon) — le pli des offres exige le MÊME prédicat que la catégorie « recrutement ».
describe('isJobOffer + foldSameTitleOffers — K3 recette 22/10 : un seul prédicat', () => {
  const title = 'Measurement and Data Marketing Manager'
  const viaSource = (location: string) => ({
    signal: title,
    location,
    source_kind: null,
    type: 'signal',
    source: 'Offre d’emploi · Welcome to the Jungle',
    date: '2026-10-03',
  })

  it('le type, la nature collectée ou la source « offre d’emploi » font une offre', () => {
    expect(isJobOffer({ type: 'hiring' })).toBe(true)
    expect(isJobOffer({ type: 'signal', source_kind: 'job' })).toBe(true)
    expect(isJobOffer({ type: 'signal', source: 'Offre d’emploi · APEC' })).toBe(true)
  })

  it('⚠️ SAIT DIRE NON — presse, type libre, rien : pas une offre', () => {
    expect(isJobOffer({ type: 'signal', source_kind: 'press', source: 'Les Echos' })).toBe(false)
    expect(isJobOffer({})).toBe(false)
  })

  it('3 lignes au même intitulé, source recrutement SANS source_kind=job → 1 ligne « 3 annonces »', () => {
    const folded = foldSameTitleOffers([viaSource('Lille'), viaSource('Paris'), viaSource('Lyon')])
    expect(folded).toHaveLength(1)
    expect(folded[0]?.offerCount).toBe(3)
    expect(folded[0]?.offerPlaces).toEqual(['Lille', 'Paris', 'Lyon'])
  })
})
