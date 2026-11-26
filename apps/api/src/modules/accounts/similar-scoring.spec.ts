import type { AnalysisProfileData, CompanySuggestion } from '@bellum/contracts'
import {
  matchSimilarCandidate,
  rankSimilarCandidates,
  scoreSimilarCandidate,
  sharedRoleFamilies,
  SIMILAR_SCORE_MAX,
  spreadAcrossSeeds,
} from './similar-scoring'

/** Candidate factory — the NAF-seeded discovery shape (seed = division token). */
function candidate(overrides: Partial<CompanySuggestion> = {}, seed = 'banque') {
  const suggestion: CompanySuggestion = {
    name: 'ACME',
    siren: '123456789',
    city: 'Paris',
    sector: 'Autres intermédiations monétaires',
    ...overrides,
  }
  return { suggestion, seed }
}

describe('scoreSimilarCandidate — scoring hybride déterministe (addendum Théo)', () => {
  it('NAF seul : profil vide ⇒ score 0 (aucun critère ne matche, rien d’inventé)', () => {
    expect(scoreSimilarCandidate(candidate(), {})).toBe(0)
  })

  describe('critère secteur (poids 3)', () => {
    it('matche un mot-clé des secteurs cibles dans le libellé NAF (préfixe bidirectionnel)', () => {
      const profile: AnalysisProfileData = { sectors: ['Assurance & Mutuelles'] }
      // « assurance » ↔ « Assurances » (pluriel) via préfixe.
      expect(scoreSimilarCandidate(candidate({ sector: 'Assurances de personnes' }), profile)).toBe(3)
    })

    it('matche via le seed NAF de découverte quand le libellé NAF est opaque', () => {
      // « Autres intermédiations monétaires » ne contient pas « banque », mais le
      // seed de division NAF (64 → « banque ») porte le secteur.
      const profile: AnalysisProfileData = { sectors: ['Banque de détail & Banque privée'] }
      expect(scoreSimilarCandidate(candidate({ sector: 'Autres intermédiations monétaires' }), profile)).toBe(3)
    })

    it('ignore les mots génériques des libellés (« Services », « Grande »…)', () => {
      const profile: AnalysisProfileData = { sectors: ['Fintech & Services financiers'] }
      // « Services » seul ne doit pas matcher un candidat « Services funéraires ».
      expect(scoreSimilarCandidate(candidate({ sector: 'Services funéraires' }, 'commerce'), profile)).toBe(0)
    })
  })

  describe('critère géographie (poids 2)', () => {
    it('matche la ville citée dans une zone du profil', () => {
      const profile: AnalysisProfileData = { sectors: [], geoZone: 'Lyon & Auvergne-Rhône-Alpes' }
      expect(scoreSimilarCandidate(candidate({ city: 'Lyon' }), profile)).toBe(2)
    })

    it('matche le département du code postal via la région (38 → Auvergne-Rhône-Alpes)', () => {
      const profile: AnalysisProfileData = { geoZone: 'Lyon & Auvergne-Rhône-Alpes' }
      expect(scoreSimilarCandidate(candidate({ city: 'Grenoble', postal_code: '38000' }), profile)).toBe(2)
    })

    it('résout l’alias PACA (13 → Provence-Alpes-Côte d’Azur)', () => {
      const profile: AnalysisProfileData = { geoZone: 'Marseille & PACA' }
      expect(scoreSimilarCandidate(candidate({ city: 'Aubagne', postal_code: '13400' }), profile)).toBe(2)
    })

    it('ne score PAS quand le profil ne restreint pas la géo (National / remote)', () => {
      const profile: AnalysisProfileData = {
        geoZone: 'National (toute la France), Full remote (pas de contrainte géo)',
      }
      expect(scoreSimilarCandidate(candidate({ city: 'Paris', postal_code: '75001' }), profile)).toBe(0)
    })

    it('ne score PAS un candidat hors zone', () => {
      const profile: AnalysisProfileData = { geoZone: 'Paris & Île-de-France' }
      expect(scoreSimilarCandidate(candidate({ city: 'Toulouse', postal_code: '31000' }), profile)).toBe(0)
    })

    it('ne score PAS sans ville ni code postal (donnée absente = pas de score)', () => {
      const profile: AnalysisProfileData = { geoZone: 'Paris & Île-de-France' }
      expect(scoreSimilarCandidate(candidate({ city: '', postal_code: null }), profile)).toBe(0)
    })
  })

  describe('critère taille (poids 2)', () => {
    it('parse la tranche choisie par le vendeur (« ETI (500-5 000 salariés) ») et matche le recoupement', () => {
      const profile: AnalysisProfileData = { targetCompanyTypes: ['ETI (500-5 000 salariés)'] }
      expect(scoreSimilarCandidate(candidate({ employees_min: 500, employees_max: 999 }), profile)).toBe(2)
    })

    it('grands comptes (CAC40/SBF120) ⇒ ≥ 5 000 salariés', () => {
      const profile: AnalysisProfileData = { targetCompanyTypes: ['CAC40 / SBF120 (grands comptes)'] }
      expect(scoreSimilarCandidate(candidate({ employees_min: 5000, employees_max: 9999 }), profile)).toBe(2)
      expect(scoreSimilarCandidate(candidate({ employees_min: 100, employees_max: 199 }), profile)).toBe(0)
    })

    it('ne score PAS sans effectifs registre (donnée absente = pas de score)', () => {
      const profile: AnalysisProfileData = { targetCompanyTypes: ['PME (50-500 salariés)'] }
      expect(scoreSimilarCandidate(candidate({ employees_min: null, employees_max: null }), profile)).toBe(0)
    })

    it('un type cible sans dimension de taille (« Secteur public ») ne matche rien', () => {
      const profile: AnalysisProfileData = { targetCompanyTypes: ['Secteur public & Collectivités'] }
      expect(scoreSimilarCandidate(candidate({ employees_min: 100, employees_max: 199 }), profile)).toBe(0)
    })

    // #3092 — retour bêta Apricot Labs : « Laura a renvoyé des micro-entreprises
    // et pas des startups ». Une tranche d'effectifs 1-250 seule ne distingue
    // pas une jeune pousse d'une TPE vieille de vingt ans.
    describe('« Startups & Scale-ups » — la tranche d’effectifs seule ne suffit plus (#3092)', () => {
      it('une structure dont le registre CONFIRME plus de 8 ans ne matche plus « startup »', () => {
        const profile: AnalysisProfileData = { targetCompanyTypes: ['Startups & Scale-ups'] }
        const old = candidate({ employees_min: 3, employees_max: 5, creation_date: '1998-06-01' })
        expect(scoreSimilarCandidate(old, profile)).toBe(0)
      })

      it('une structure dont le registre confirme moins de 8 ans matche, et le rang « size » sort', () => {
        const profile: AnalysisProfileData = { targetCompanyTypes: ['Startups & Scale-ups'] }
        const recentIso = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString()
        const young = candidate({ employees_min: 3, employees_max: 5, creation_date: recentIso })
        expect(scoreSimilarCandidate(young, profile)).toBe(2)
        expect(matchSimilarCandidate(young, profile).reasons).toContain('size')
      })

      it('date de création ABSENTE : aucune donnée inventée, le critère matche comme avant (pas de pénalité)', () => {
        const profile: AnalysisProfileData = { targetCompanyTypes: ['Startups & Scale-ups'] }
        const unknownAge = candidate({ employees_min: 3, employees_max: 5, creation_date: null })
        expect(scoreSimilarCandidate(unknownAge, profile)).toBe(2)
      })

      it('un AUTRE type ciblé (ETI) sur la même structure ancienne reste intact', () => {
        const profile: AnalysisProfileData = {
          targetCompanyTypes: ['ETI (500-5 000 salariés)', 'Startups & Scale-ups'],
        }
        const old = candidate({ employees_min: 800, employees_max: 999, creation_date: '1998-06-01' })
        expect(scoreSimilarCandidate(old, profile)).toBe(2)
      })
    })
  })

  it('tout : secteur + géo + taille cumulés = SIMILAR_SCORE_MAX', () => {
    const profile: AnalysisProfileData = {
      sectors: ['Banque de détail & Banque privée'],
      geoZone: 'Paris & Île-de-France',
      targetCompanyTypes: ['ETI (500-5 000 salariés)'],
    }
    const full = candidate({ city: 'Nanterre', postal_code: '92000', employees_min: 1000, employees_max: 1999 })
    expect(scoreSimilarCandidate(full, profile)).toBe(SIMILAR_SCORE_MAX)
  })
})

describe('rankSimilarCandidates — tri stable', () => {
  it('classe par score décroissant, les ex æquo gardent l’ordre de découverte', () => {
    const profile: AnalysisProfileData = { targetCompanyTypes: ['ETI (500-5 000 salariés)'] }
    const first = candidate({ name: 'Premier Pappers' })
    const second = candidate({ name: 'Deuxième Pappers' })
    const sized = candidate({ name: 'ETI Match', employees_min: 600, employees_max: 700 })

    const ranked = rankSimilarCandidates([first, second, sized], profile)

    expect(ranked.map(r => r.suggestion.name)).toEqual(['ETI Match', 'Premier Pappers', 'Deuxième Pappers'])
    expect(ranked[0]?.score).toBe(2)
    expect(ranked[1]?.score).toBe(0)
  })

  it('profil vide ⇒ ordre d’entrée strictement conservé', () => {
    const input = [candidate({ name: 'A' }), candidate({ name: 'B' }), candidate({ name: 'C' })]
    expect(rankSimilarCandidates(input, {}).map(r => r.suggestion.name)).toEqual(['A', 'B', 'C'])
  })
})

/**
 * SIM-01 (audit terrain du 17/08) : « aucun compte n'est affiché sans
 * justification ». Le module ne rendait qu'un scalaire, où trois critères de
 * poids 3-2-2 s'écrasent — la même phrase sortait pour un compte qui coche les
 * trois et pour un compte qui n'en coche aucun.
 */
describe('matchSimilarCandidate — les critères, pas seulement leur somme', () => {
  const profile: AnalysisProfileData = {
    sectors: ['Banque, assurance, finance'],
    geoZone: 'Paris & Île-de-France',
    targetCompanyTypes: ['ETI (500-5 000 salariés)'],
  } as AnalysisProfileData

  const nearby = (over: Record<string, unknown> = {}) => ({
    suggestion: {
      siren: '123456789',
      name: 'ACME',
      sector: 'Autres intermédiations monétaires',
      city: 'Paris',
      postal_code: '75002',
      employees_min: 900,
      employees_max: 1200,
      ...over,
    },
    seed: 'banque',
  })

  it('nomme les trois critères quand les trois matchent', () => {
    const match = matchSimilarCandidate(nearby() as never, profile)
    expect(match.reasons).toEqual(['sector', 'geo', 'size'])
    expect(match.score).toBe(SIMILAR_SCORE_MAX)
  })

  it('ne nomme QUE ce qui a réellement matché', () => {
    const match = matchSimilarCandidate(nearby({ city: 'Bordeaux', postal_code: '33000' }) as never, profile)
    expect(match.reasons).toEqual(['sector', 'size'])
  })

  it('rend une liste VIDE quand rien ne rapproche — l’écran doit pouvoir le dire', () => {
    const match = matchSimilarCandidate(
      nearby({
        sector: 'Boulangerie et boulangerie-pâtisserie',
        city: 'Bordeaux',
        postal_code: '33000',
        employees_min: 3,
        employees_max: 5,
      }) as never,
      { ...profile, sectors: ['Santé & médico-social'] },
    )
    // #2040.18 — le profil de ce bloc répond aux TROIS axes : la confiance est
    // donc « etayee » et il n'y a rien à nommer en creux. Le score vaut bien 0
    // parce que trois axes ÉVALUABLES n'ont rien recoupé — un 0 qui est VRAI,
    // à ne pas confondre avec le 0 d'un axe muet (cf. « partielle »).
    expect(match).toEqual({
      score: 0,
      reasons: [],
      evaluated: ['sector', 'geo', 'size'],
      unevaluated: [],
      confidence: 'etayee',
    })
  })

  it('garde le score identique à l’ancienne fonction — aucun classement ne bouge', () => {
    const one = nearby()
    expect(scoreSimilarCandidate(one as never, profile)).toBe(matchSimilarCandidate(one as never, profile).score)
  })

  it('rend les raisons avec le classement, pour chaque candidat', () => {
    const ranked = rankSimilarCandidates(
      [nearby({ name: 'LOIN', city: 'Bordeaux', postal_code: '33000' }), nearby({ name: 'PROCHE' })] as never,
      profile,
    )
    expect(ranked[0]!.suggestion.name).toBe('PROCHE')
    expect(ranked[0]!.reasons).toEqual(['sector', 'geo', 'size'])
    expect(ranked[1]!.reasons).toEqual(['sector', 'size'])
  })
})

/**
 * #1576 — la règle de répartition. Le témoin qui compte est le PREMIER : c'est
 * le cas réel mesuré en production le 08/09/2026 (profil vide ⇒ scores tous
 * nuls ⇒ ordre de découverte ⇒ une seule amorce occupait les quatre places).
 */
describe('spreadAcrossSeeds', () => {
  const item = (name: string, seed: string) => ({ name, seed })

  it('donne sa place à chaque amorce avant d’en resservir une', () => {
    const ranked = [
      item('A1', 'nova'),
      item('A2', 'nova'),
      item('A3', 'nova'),
      item('A4', 'nova'),
      item('A5', 'nova'),
      item('B1', 'sncf'),
      item('C1', 'blablacar'),
    ]
    expect(spreadAcrossSeeds(ranked, 4, entry => entry.seed).map(entry => entry.name)).toEqual(['A1', 'B1', 'C1', 'A2'])
  })

  it('garde le meilleur classé en tête — la règle ne re-classe rien', () => {
    const ranked = [item('MEILLEUR', 'a'), item('SECOND', 'b'), item('TROISIEME', 'a')]
    expect(spreadAcrossSeeds(ranked, 3, entry => entry.seed)[0]!.name).toBe('MEILLEUR')
  })

  it('comble les places restantes dans l’ordre du classement quand les amorces manquent', () => {
    const ranked = [item('A1', 'a'), item('A2', 'a'), item('A3', 'a')]
    expect(spreadAcrossSeeds(ranked, 4, entry => entry.seed).map(entry => entry.name)).toEqual(['A1', 'A2', 'A3'])
  })

  it('ne rend rien pour une borne nulle ou négative', () => {
    const ranked = [item('A1', 'a')]
    expect(spreadAcrossSeeds(ranked, 0, entry => entry.seed)).toEqual([])
    expect(spreadAcrossSeeds(ranked, -1, entry => entry.seed)).toEqual([])
  })

  it('ne duplique jamais un candidat', () => {
    const ranked = [item('A1', 'a'), item('B1', 'b')]
    const picked = spreadAcrossSeeds(ranked, 5, entry => entry.seed)
    expect(picked).toHaveLength(2)
    expect(new Set(picked.map(entry => entry.name)).size).toBe(2)
  })
})

/**
 * #2127.30 — LES FAMILLES DE RÔLES RECRUTÉES EN COMMUN.
 *
 * Un rapprochement d'ENTREPRISES : des comptages `{ family, persons }` du
 * signal marché, jamais une personne — `sharedRoleFamilies` ne lit que des
 * chaînes de famille, et c'est ce que la garde d'architecture vérifie sur le
 * fichier entier (aucun champ protégé, aucune identité).
 */
describe('sharedRoleFamilies — au moins une famille recrutée des deux côtés (#2127.30)', () => {
  it('vrai quand une famille (repliée sur la casse/les espaces) apparaît des deux côtés', () => {
    expect(sharedRoleFamilies(['Data / IA', 'PMO'], ['pmo', 'Infra / Cloud'])).toBe(true)
  })

  it('faux quand aucune famille ne se recoupe', () => {
    expect(sharedRoleFamilies(['Data / IA'], ['Infra / Cloud'])).toBe(false)
  })

  it('faux quand un côté n’est pas couvert — jamais deviné', () => {
    expect(sharedRoleFamilies(null, ['Data / IA'])).toBe(false)
    expect(sharedRoleFamilies(['Data / IA'], null)).toBe(false)
  })

  it('faux quand les deux côtés sont couverts mais vides', () => {
    expect(sharedRoleFamilies([], [])).toBe(false)
  })
})
