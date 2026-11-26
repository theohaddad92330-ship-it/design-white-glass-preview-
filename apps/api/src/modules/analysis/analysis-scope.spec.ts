import type { AnalysisContactSeed, AnalysisEnrichedContact, AnalysisScopeSelection } from '@bellum/contracts'
import {
  applyScopeToContactSeeds,
  applyScopeToEnrichedContacts,
  applyScopeToResearch,
  contactSearchExcludedBy,
  isExcludedLabel,
  isOutsideGeoPerimeter,
  pruneOrgGraphPeople,
} from './analysis-scope'

const selection = (patch: Partial<AnalysisScopeSelection>): AnalysisScopeSelection => patch

const seed = (fullName: string, organization?: string): AnalysisContactSeed => ({
  fullName,
  title: 'Directeur',
  linkedinUrl: '',
  city: 'Paris',
  country: 'France',
  source: 'apollo',
  ...(organization ? { apolloDetails: { organization } } : {}),
})

describe('isExcludedLabel', () => {
  it('exclut le libellé exact, ses variantes et ignore la casse/les accents', () => {
    expect(isExcludedLabel('TF1 PUB', ['tf1 pub'])).toBe(true)
    expect(isExcludedLabel('TF1 PUB SA', ['TF1 PUB'])).toBe(true)
    expect(isExcludedLabel('Société Générale', ['societe generale'])).toBe(true)
  })

  it("n'exclut PAS le parent quand on a exclu la filiale (sens unique)", () => {
    expect(isExcludedLabel('TF1', ['TF1 PUB'])).toBe(false)
  })

  it('borne les mots — exclure « pub » ne supprime pas « Publicis »', () => {
    expect(isExcludedLabel('Publicis', ['pub'])).toBe(false)
    expect(isExcludedLabel('TF1 Pub', ['pub'])).toBe(true)
  })

  it('ignore un critère trop court pour être fiable', () => {
    expect(isExcludedLabel('SA Machin', ['sa'])).toBe(false)
  })

  it('sans exclusion, rien ne tombe', () => {
    expect(isExcludedLabel('TF1 PUB', [])).toBe(false)
    expect(isExcludedLabel('TF1 PUB', undefined)).toBe(false)
  })
})

describe('applyScopeToResearch', () => {
  const research = {
    businessDescription: 'Groupe média',
    subsidiaries: [{ name: 'TF1 PUB' }, { name: 'TF1 Films Production' }],
    entitiesExhaustive: ['TF1 PUB SA', 'Newen Studios'],
    sitesFrance: [{ label: 'Boulogne' }],
    angles: [
      { angle: 'Refonte publicité programmatique', offer: 'Data' },
      { angle: 'Modernisation ERP', offer: 'ERP' },
    ],
    pains: [{ pain: 'Régie publicitaire vieillissante' }],
  }

  it('retire les entités écartées, dans toutes les listes qui les portent', () => {
    const out = applyScopeToResearch(research, selection({ excluded_entities: ['TF1 PUB'] }))

    expect(out?.subsidiaries).toEqual([{ name: 'TF1 Films Production' }])
    expect(out?.entitiesExhaustive).toEqual(['Newen Studios'])
    expect(out?.sitesFrance).toEqual([{ label: 'Boulogne' }])
  })

  it('retire les angles portant un thème écarté, mais garde les faits', () => {
    const out = applyScopeToResearch(research, selection({ excluded_angles: ['ERP'] }))

    expect(out?.angles).toEqual([{ angle: 'Refonte publicité programmatique', offer: 'Data' }])
    // Une douleur est une OBSERVATION : elle reste au dossier.
    expect(out?.pains).toEqual(research.pains)
  })

  it('rend le blob inchangé (même référence) sans cadrage', () => {
    expect(applyScopeToResearch(research, undefined)).toBe(research)
    expect(applyScopeToResearch(research, selection({}))).toBe(research)
    expect(applyScopeToResearch(research, selection({ excluded_entities: ['Orange'] }))).toBe(research)
  })

  it('ne casse pas sur un blob sans les clés attendues', () => {
    const thin = { businessDescription: 'x' }
    expect(applyScopeToResearch(thin, selection({ excluded_entities: ['TF1 PUB'] }))).toBe(thin)
    expect(applyScopeToResearch(undefined, selection({ excluded_entities: ['TF1 PUB'] }))).toBeUndefined()
  })
})

describe('applyScopeToContactSeeds', () => {
  it("écarte les contacts dont l'employeur est une entité exclue", () => {
    const seeds = [seed('Alice', 'TF1 PUB'), seed('Bob', 'TF1 SA'), seed('Chloé')]

    const { kept, dropped } = applyScopeToContactSeeds(seeds, selection({ excluded_entities: ['TF1 PUB'] }))

    expect(kept?.map(c => c.fullName)).toEqual(['Bob', 'Chloé'])
    expect(dropped).toBe(1)
  })

  it('rend la liste telle quelle sans exclusion', () => {
    const seeds = [seed('Alice', 'TF1 PUB')]
    expect(applyScopeToContactSeeds(seeds, undefined).kept).toBe(seeds)
  })
})

describe('contactSearchExcludedBy — le cadrage mord AVANT la dépense', () => {
  it('refuse une recherche ciblée sur une entité que le commercial a écartée', () => {
    expect(contactSearchExcludedBy({ entity: 'TF1 PUB SA' }, selection({ excluded_entities: ['TF1 PUB'] }))).toEqual({
      field: 'entity',
      label: 'TF1 PUB SA',
    })
  })

  it('refuse une recherche ciblée sur un thème écarté', () => {
    expect(contactSearchExcludedBy({ theme: 'ERP SAP' }, selection({ excluded_angles: ['ERP'] }))).toEqual({
      field: 'theme',
      label: 'ERP SAP',
    })
    expect(contactSearchExcludedBy({ family: 'cyber' }, selection({ excluded_angles: ['cyber'] }))).toEqual({
      field: 'family',
      label: 'cyber',
    })
  })

  it('laisse passer ce qui n’est pas écarté', () => {
    expect(contactSearchExcludedBy({ entity: 'Newen' }, selection({ excluded_entities: ['TF1 PUB'] }))).toBeNull()
    // Le sens unique de `isExcludedLabel` vaut ici aussi : exclure la filiale
    // n'interdit pas de chercher chez le parent.
    expect(contactSearchExcludedBy({ entity: 'TF1' }, selection({ excluded_entities: ['TF1 PUB'] }))).toBeNull()
  })

  it('sans cadrage — ou sans recherche ciblée — ne refuse jamais rien', () => {
    expect(contactSearchExcludedBy({ entity: 'TF1 PUB' }, undefined)).toBeNull()
    expect(contactSearchExcludedBy({ entity: 'TF1 PUB' }, selection({}))).toBeNull()
    expect(contactSearchExcludedBy(undefined, selection({ excluded_entities: ['TF1 PUB'] }))).toBeNull()
  })
})

describe('applyScopeToEnrichedContacts', () => {
  const enriched = (fullName: string, entity: string): AnalysisEnrichedContact => ({
    fullName,
    entity,
    role: 'DSI',
    priority: 1,
    summary: '',
    whyContact: '',
    email: '',
    phone: '',
    emailVerified: false,
  })

  it('écarte les contacts classés sur une entité exclue', () => {
    const items = [enriched('Alice', 'TF1 PUB'), enriched('Bob', 'Newen')]

    const { kept, dropped } = applyScopeToEnrichedContacts(items, selection({ excluded_entities: ['tf1 pub'] }))

    expect(kept?.map(c => c.fullName)).toEqual(['Bob'])
    expect(dropped).toBe(1)
  })
})

describe('isOutsideGeoPerimeter — la zone dite par le TITRE (#3742, #3744, #3820)', () => {
  const france = selection({ geo_perimeter: 'france' })
  const europe = selection({ geo_perimeter: 'europe' })

  it.each([
    'VP Nordics',
    'Emil B. — BeNe / Nordics / Baltics',
    'Chief Digital Officer CEE',
    'CFO India',
    'Zone CFO Nordic',
    'Vice President Pacific',
    'Cairo Hub Lead',
  ])('écarte « %s » sous France', title => {
    expect(isOutsideGeoPerimeter({ title }, france)).toBe(true)
  })

  it('garde Head of France, un rôle Europe/EMEA, et un titre sans lieu sous France', () => {
    expect(isOutsideGeoPerimeter({ title: 'Head of France' }, france)).toBe(false)
    expect(isOutsideGeoPerimeter({ title: 'VP Europe' }, france)).toBe(false)
    expect(isOutsideGeoPerimeter({ title: 'Directeur EMEA' }, france)).toBe(false)
    expect(isOutsideGeoPerimeter({ title: 'Directeur des achats' }, france)).toBe(false)
    expect(isOutsideGeoPerimeter({ title: 'Head of France & Nordics' }, france)).toBe(false)
  })

  it('sous Europe : les Nordics restent, Pacific et India sortent', () => {
    expect(isOutsideGeoPerimeter({ title: 'VP Nordics' }, europe)).toBe(false)
    expect(isOutsideGeoPerimeter({ title: 'CFO India' }, europe)).toBe(true)
  })

  it('écarte une filiale étrangère nommée (Alcampo) sous France, pas sous Europe-sans-preuve', () => {
    expect(isOutsideGeoPerimeter({ organization: 'Alcampo' }, france)).toBe(true)
    expect(isOutsideGeoPerimeter({ organization: 'Auchan Retail France' }, france)).toBe(false)
  })

  it('Site = ville : un titre dit-il explicitement hors France ? Oui ⇒ sort ; sans lieu ⇒ reste', () => {
    const lille = selection({ geo_perimeter: 'city', geo_areas: ['Lille'] })
    expect(isOutsideGeoPerimeter({ title: 'Directeur Portugal' }, lille)).toBe(true)
    expect(isOutsideGeoPerimeter({ title: 'Directeur magasin' }, lille)).toBe(false)
  })
})

describe('isOutsideGeoPerimeter — « France » veut dire France (#3742, #3744)', () => {
  const france = selection({ geo_perimeter: 'france' })

  it('écarte un contact dont le pays est connu et étranger', () => {
    expect(isOutsideGeoPerimeter({ country: 'Spain', city: 'Madrid' }, france)).toBe(true)
    expect(isOutsideGeoPerimeter({ country: 'India', city: 'Bengaluru' }, france)).toBe(true)
    expect(isOutsideGeoPerimeter({ country: 'Espagne' }, france)).toBe(true)
  })

  it('garde un contact français, avec ou sans accent ni casse', () => {
    expect(isOutsideGeoPerimeter({ country: 'France', city: 'Paris' }, france)).toBe(false)
    expect(isOutsideGeoPerimeter({ country: 'FRANCE' }, france)).toBe(false)
  })

  it("garde un contact dont le lieu est inconnu : une absence n'est pas une preuve", () => {
    expect(isOutsideGeoPerimeter({ country: '', city: '' }, france)).toBe(false)
    expect(isOutsideGeoPerimeter({ country: null, location: null }, france)).toBe(false)
  })

  it("n'écarte rien sans cadrage, en monde ou en international", () => {
    expect(isOutsideGeoPerimeter({ country: 'India' }, undefined)).toBe(false)
    expect(isOutsideGeoPerimeter({ country: 'India' }, selection({}))).toBe(false)
    expect(isOutsideGeoPerimeter({ country: 'India' }, selection({ geo_perimeter: 'world' }))).toBe(false)
    expect(isOutsideGeoPerimeter({ country: 'India' }, selection({ geo_perimeter: 'international' }))).toBe(false)
  })

  it('en Europe, garde Espagne et France, écarte Inde', () => {
    const europe = selection({ geo_perimeter: 'europe' })
    expect(isOutsideGeoPerimeter({ country: 'Spain' }, europe)).toBe(false)
    expect(isOutsideGeoPerimeter({ country: 'France' }, europe)).toBe(false)
    expect(isOutsideGeoPerimeter({ country: 'India' }, europe)).toBe(true)
  })

  it('lit aussi la localisation libre (« Madrid, Spain »)', () => {
    expect(isOutsideGeoPerimeter({ location: 'Madrid, Spain' }, france)).toBe(true)
    expect(isOutsideGeoPerimeter({ location: 'Lyon, France' }, france)).toBe(false)
  })
})

// #3820 — granularité SITE : un siège hors zone n'exclut qu'un INDIVIDU dont
// le lieu dit explicitement un AUTRE endroit, jamais un groupe/une entité.
describe('isOutsideGeoPerimeter — périmètre SITE (#3820)', () => {
  const siteLille = selection({ geo_perimeter: 'city', geo_areas: ['Lille'] })

  it('écarte un contact dont la ville connue n’est PAS celle du site visé', () => {
    expect(isOutsideGeoPerimeter({ city: 'Paris', country: 'France' }, siteLille)).toBe(true)
    expect(isOutsideGeoPerimeter({ location: 'Paris, France' }, siteLille)).toBe(true)
  })

  it('garde un contact dont le lieu nomme le site visé, avec ou sans casse/accent', () => {
    expect(isOutsideGeoPerimeter({ city: 'lille' }, siteLille)).toBe(false)
    expect(isOutsideGeoPerimeter({ location: 'Lille, France' }, siteLille)).toBe(false)
  })

  it("garde un contact dont le lieu est inconnu : une absence n'est pas une preuve", () => {
    expect(isOutsideGeoPerimeter({ country: 'France' }, siteLille)).toBe(false)
    expect(isOutsideGeoPerimeter({}, siteLille)).toBe(false)
  })

  it('sans ville saisie dans le cadrage, rien à comparer : rien ne restreint', () => {
    expect(isOutsideGeoPerimeter({ city: 'Paris' }, selection({ geo_perimeter: 'city' }))).toBe(false)
  })
})

describe('applyScopeToContactSeeds — périmètre géographique', () => {
  it('écarte à la collecte les contacts étrangers et les compte', () => {
    const spain: AnalysisContactSeed = { ...seed('Carlos'), city: 'Madrid', country: 'Spain' }
    const { kept, dropped } = applyScopeToContactSeeds([seed('Alice'), spain], selection({ geo_perimeter: 'france' }))
    expect(kept?.map(c => c.fullName)).toEqual(['Alice'])
    expect(dropped).toBe(1)
  })

  // #3820 — même geste à la collecte pour un périmètre SITE : un contact
  // parisien ne doit jamais entrer au dossier d'une analyse cadrée sur Lille.
  it('écarte à la collecte les contacts hors site (#3820)', () => {
    const paris: AnalysisContactSeed = { ...seed('Bob'), city: 'Paris' }
    const lille: AnalysisContactSeed = { ...seed('Chloé'), city: 'Lille' }
    const { kept, dropped } = applyScopeToContactSeeds(
      [paris, lille],
      selection({ geo_perimeter: 'city', geo_areas: ['Lille'] }),
    )
    expect(kept?.map(c => c.fullName)).toEqual(['Chloé'])
    expect(dropped).toBe(1)
  })
})

describe('pruneOrgGraphPeople — l’organigramme suit le périmètre (#3742, #3744)', () => {
  const org = {
    decisionChain: ['x'],
    orgGraph: {
      graphVersion: 1,
      entities: [{ id: 'e1', name: 'Accor', type: 'groupe', confidence: 80 }],
      people: [
        { id: 'p-alice', fullName: 'Alice Martin', entityId: 'e1', identityStatus: 'classified', confidence: 80 },
        { id: 'p-carlos', fullName: 'Carlos Ruiz', entityId: 'e1', identityStatus: 'classified', confidence: 80 },
        { id: 'p-nadia', fullName: 'Nadia Sans Pays', entityId: 'e1', identityStatus: 'classified', confidence: 80 },
      ],
      hierarchyEdges: [
        { fromId: 'p-carlos', toId: 'p-alice', type: 'reports_to' },
        { fromId: 'p-nadia', toId: 'p-alice', type: 'reports_to' },
      ],
      recommendedPath: [{ personId: 'p-carlos' }, { personId: 'p-alice' }],
    },
  }

  it('retire la personne hors périmètre et les liens qui la citent ; un nœud sans pays connu reste', () => {
    const pruned = pruneOrgGraphPeople(org, new Set(['carlos ruiz']))
    const graph = pruned.org?.['orgGraph'] as Record<string, Array<Record<string, unknown>>>
    expect(graph['people']!.map(p => p['id'])).toEqual(['p-alice', 'p-nadia'])
    expect(graph['hierarchyEdges']).toEqual([{ fromId: 'p-nadia', toId: 'p-alice', type: 'reports_to' }])
    expect(graph['recommendedPath']).toEqual([{ personId: 'p-alice' }])
    expect(pruned.org?.['decisionChain']).toEqual(['x'])
    expect(pruned.removed).toBe(1)
  })

  it('sait dire NON : aucun nom écarté ⇒ même référence, rien retiré', () => {
    const pruned = pruneOrgGraphPeople(org, new Set())
    expect(pruned.org).toBe(org)
    expect(pruned.removed).toBe(0)
  })
})
