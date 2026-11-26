import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_JOB_OFFERS_MAX,
  ACCOUNT_JOB_OFFERS_STEP,
  demoAccountJobOffers,
  normalizeContractType,
  offerOriginLabel,
  toAccountJobOffer,
} from './account-job-offers.js'

describe('offres d’un compte par métier (Louis 30/10)', () => {
  it('5 par 5, jusqu’à 50', () => {
    expect(ACCOUNT_JOB_OFFERS_STEP).toBe(5)
    expect(ACCOUNT_JOB_OFFERS_MAX).toBe(50)
  })

  it('lit une offre du moteur sans nommer le fournisseur', () => {
    const offer = toAccountJobOffer({
      title: 'Data Scientist',
      company: 'DECATHLON',
      city: 'Lille',
      url: 'https://o/1',
      date: '2026-10-20',
      contractType: 'CDI',
      source: 'adzuna',
    })
    expect(offer).toEqual({
      title: 'Data Scientist',
      employer: 'DECATHLON',
      city: 'Lille',
      url: 'https://o/1',
      publishedAt: '2026-10-20',
      contractType: 'CDI',
      origin: null,
    })
    expect(JSON.stringify(offer)).not.toContain('adzuna')
  })

  it('écarte une offre de stage et une ligne sans intitulé', () => {
    expect(toAccountJobOffer({ title: 'Stage Data Analyst' })).toBeNull()
    expect(toAccountJobOffer({ title: 'Data Analyst', contract_type: 'Stage' })).toBeNull()
    expect(toAccountJobOffer({ city: 'Lyon' })).toBeNull()
  })

  it('démo : filtre les offres semées par le métier, accents et casse ignorés', () => {
    const seeded = [{ title: 'Ingénieur Données' }, { title: 'Responsable exploitation' }, { title: 'Stage données' }]
    const out = demoAccountJobOffers(seeded, ' données ')
    expect(out).toEqual({
      term: 'données',
      searched: true,
      offers: [expect.objectContaining({ title: 'Ingénieur Données' })],
    })
    expect(demoAccountJobOffers(seeded, '').offers).toHaveLength(2)
    expect(demoAccountJobOffers(null, 'data').offers).toEqual([])
  })

  // #5000.1 — un type normalisé unique, pris sur le contrat DÉCLARÉ, jamais déduit.
  it('normalise le contrat déclaré, « non précisé » sinon', () => {
    expect(normalizeContractType('CDI')).toBe('CDI')
    expect(normalizeContractType('permanent')).toBe('CDI')
    expect(normalizeContractType('Contrat à durée déterminée')).toBe('CDD')
    expect(normalizeContractType('Intérim')).toBe('intérim')
    expect(normalizeContractType('MIS')).toBe('intérim')
    expect(normalizeContractType('Libéral / indépendant')).toBe('freelance')
    expect(normalizeContractType('freelance')).toBe('freelance')
    expect(normalizeContractType('Apprentissage')).toBe('autre')
    expect(normalizeContractType(null)).toBe('non précisé')
    expect(normalizeContractType('  ')).toBe('non précisé')
    // jamais déduit du titre
    expect(toAccountJobOffer({ title: 'Consultant freelance' })?.contractType).toBe('non précisé')
  })

  // #5010.1 — hôte de l'URL de l'offre sur une liste fermée ; hors liste = rien.
  it('nomme le site d’origine par l’hôte de l’URL, liste fermée', () => {
    expect(offerOriginLabel('https://www.linkedin.com/jobs/view/1')).toBe('LinkedIn')
    expect(offerOriginLabel('https://candidat.francetravail.fr/offres/recherche/detail/1')).toBe('France Travail')
    expect(offerOriginLabel('https://fr.indeed.com/viewjob?jk=1')).toBe('Indeed')
    expect(offerOriginLabel('https://www.welcometothejungle.com/fr/jobs/x')).toBe('Welcome to the Jungle')
    expect(offerOriginLabel('https://www.apec.fr/candidat/x')).toBe('APEC')
    expect(offerOriginLabel('https://careers.acme.io/1')).toBeNull()
    expect(offerOriginLabel('https://notlinkedin.com/1')).toBeNull()
    expect(offerOriginLabel('nope')).toBeNull()
    expect(offerOriginLabel(null)).toBeNull()
  })

  it('l’offre porte son site d’origine, jamais le fournisseur', () => {
    const offer = toAccountJobOffer({ title: 'Dev', url: 'https://www.linkedin.com/jobs/1', source: 'mantiks' })
    expect(offer?.origin).toBe('LinkedIn')
    expect(JSON.stringify(offer)).not.toContain('mantiks')
    expect(toAccountJobOffer({ title: 'Dev', url: 'https://x.io/1', source: 'mantiks' })?.origin).toBeNull()
  })

  // #5010 — URL d'agrégateur ou absente : le job board déjà COLLECTÉ nomme le site, sur la même liste fermée.
  it('retombe sur le job board collecté quand l’hôte ne dit rien ; board inconnu = rien', () => {
    expect(offerOriginLabel('https://agg.example/r/1', 'linkedin')).toBe('LinkedIn')
    expect(offerOriginLabel(null, 'Welcome to the Jungle')).toBe('Welcome to the Jungle')
    expect(offerOriginLabel(null, 'france_travail')).toBe('France Travail')
    expect(offerOriginLabel('https://fr.indeed.com/1', 'linkedin')).toBe('Indeed')
    expect(offerOriginLabel(null, 'monsite-inconnu')).toBeNull()
    expect(toAccountJobOffer({ title: 'Dev', board: 'indeed', source: 'mantiks' })?.origin).toBe('Indeed')
  })

  it('le miroir de démonstration d’un site porte le même libellé (#5010.3)', () => {
    // La salle de démonstration vit sur le domaine réservé `.example` (RFC 2606, garde
    // `demo-hiring-sources-coverage`) : son écran doit pourtant nommer le site (craft rule n°9).
    expect(offerOriginLabel('https://www.welcometothejungle.example/demo/offres/x')).toBe('Welcome to the Jungle')
    expect(offerOriginLabel('https://www.apec.example/demo/offres/y')).toBe('APEC')
    expect(offerOriginLabel('https://candidat.francetravail.example/offres/1')).toBe('France Travail')
    // Sait dire NON : hors de la liste fermée, le domaine réservé ne donne aucun libellé.
    expect(offerOriginLabel('https://agg.example/r/1')).toBeNull()
    expect(offerOriginLabel('https://careers.acme.example/1')).toBeNull()
    expect(offerOriginLabel('https://notlinkedin.example/1')).toBeNull()
  })
})
