import { describe, expect, it } from 'vitest'
import { announcedPublicSources } from './marketVerificationPublicSources'

// #2288.4 (c66) — BOAMP/DECP se nomment d'après ce que le LANCEUR dit de chaque
// lancement (`publicTenderSources`), jamais d'après une liste de noms.
describe('announcedPublicSources (#2288.4)', () => {
  const tenders = { scenario: 'fresh', credits: 8, publicTenderSources: ['boamp', 'decp'] } as const
  const plain = { scenario: 'fresh', credits: 8, publicTenderSources: [] } as const
  const reopened = { scenario: 'cache_hit', accountId: 'a1', companyName: 'Atos' } as const

  it('nomme BOAMP et DECP quand un lancement les interrogera, avec France Travail (≥1 lancement réel)', () => {
    expect(announcedPublicSources({ planSources: [], plans: [tenders, tenders] })).toEqual({
      sources: ['france-travail', 'boamp', 'decp'],
      tenders: { shown: 2, launched: 2 },
    })
  })

  it('ne nomme pas BOAMP/DECP quand AUCUN lancement ne les interrogera, mais nomme France Travail (lancement réel)', () => {
    expect(announcedPublicSources({ planSources: [], plans: [plain, plain] })).toEqual({
      sources: ['france-travail'],
      tenders: null,
    })
  })

  // #2288.4 (18/09, suite) — le cœur de la fermeture : France Travail suit
  // désormais le LANCEUR comme BOAMP/DECP, elle ne se nomme plus pour une
  // vérification dont TOUS les candidats seront simplement rouverts.
  it('n’annonce PLUS France Travail quand TOUS les lancements sont des dossiers rouverts (aucune collecte)', () => {
    expect(announcedPublicSources({ planSources: [], plans: [reopened, reopened] })).toEqual({
      sources: [],
      tenders: null,
    })
  })

  it('nomme France Travail dès qu’UN SEUL des lancements est réel, même si les autres sont rouverts', () => {
    expect(announcedPublicSources({ planSources: [], plans: [plain, reopened] })).toEqual({
      sources: ['france-travail'],
      tenders: null,
    })
  })

  it('dit pour COMBIEN d’entreprises lancées, quand ce n’est pas toutes', () => {
    expect(announcedPublicSources({ planSources: [], plans: [tenders, plain] })).toEqual({
      sources: ['france-travail', 'boamp', 'decp'],
      tenders: { shown: 1, launched: 2 },
    })
  })

  it('un dossier ROUVERT ne lance rien : il ne compte pas parmi les lancements (BOAMP/DECP)', () => {
    expect(announcedPublicSources({ planSources: [], plans: [tenders, reopened] })).toEqual({
      sources: ['france-travail', 'boamp', 'decp'],
      tenders: { shown: 1, launched: 1 },
    })
  })

  it('une réponse du lanceur manquante : rien n’est annoncé — jamais une lecture partielle', () => {
    expect(announcedPublicSources({ planSources: [], plans: [tenders, null] })).toEqual({
      sources: [],
      tenders: null,
    })
  })

  it('un serveur qui ne dit rien des marchés publics (réponse ancienne) : BOAMP/DECP absents, France Travail nommée (lancement réel)', () => {
    expect(announcedPublicSources({ planSources: [], plans: [{ scenario: 'fresh', credits: 8 }] })).toEqual({
      sources: ['france-travail'],
      tenders: null,
    })
  })
})
