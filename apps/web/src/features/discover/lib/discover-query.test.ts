import {
  applyStartupSegment,
  buildRegistryQuery,
  buildSignalsQuery,
  emptyRegistryFilters,
  emptySignalsFilters,
  isRegistryQueryRunnable,
  isStartupSegmentActive,
  parseDepartment,
  parseTechnologiesObserved,
} from './discover-query'

/** Horloge figée : les fenêtres d'ancienneté sont des dates absolues. */
const NOW = Date.parse('2026-07-19T12:00:00Z')

/* ------------------------------------------------------------------ */
/*  parseDepartment                                                    */
/* ------------------------------------------------------------------ */

describe('parseDepartment', () => {
  it('accepts a plain department code', () => {
    expect(parseDepartment('75')).toBe('75')
  })

  it('left-pads a single digit so "1" reads 01, not 1', () => {
    expect(parseDepartment('1')).toBe('01')
  })

  it('accepts Corsica and the DOM', () => {
    expect(parseDepartment('2a')).toBe('2A')
    expect(parseDepartment('974')).toBe('974')
  })

  it('takes the first code when the rep pastes several (the endpoint takes one)', () => {
    expect(parseDepartment('75, 92, 69')).toBe('75')
  })

  it('rejects anything that is not a French department code', () => {
    expect(parseDepartment('Paris')).toBeUndefined()
    expect(parseDepartment('9999')).toBeUndefined()
    expect(parseDepartment('   ')).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */
/*  Secteur → section NAF (croisement côté écran)                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  buildRegistryQuery — the whole point: filters that actually filter  */
/* ------------------------------------------------------------------ */

describe('buildRegistryQuery', () => {
  it('#4045.1 — les mots-clés partent en liste et ne rendent pas la requête lançable seuls', () => {
    expect(buildRegistryQuery(emptyRegistryFilters(), NOW, 24, 'cybersécurité, SOC').filters.keywords).toEqual([
      'cybersécurité',
      'SOC',
    ])
    expect(buildRegistryQuery(emptyRegistryFilters(), NOW, 24, '  ').filters.keywords).toBeUndefined()
    expect(isRegistryQueryRunnable(emptyRegistryFilters())).toBe(false)
  })

  it('sends an empty filter object plus the limit when nothing is filled', () => {
    expect(buildRegistryQuery(emptyRegistryFilters(), NOW)).toEqual({ filters: {}, limit: 24 })
  })

  it('nests every criterion under `filters`, as the endpoint expects', () => {
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), city: 'Lyon' }, NOW)
    expect(q.filters.city).toBe('Lyon')
    expect(Object.keys(q).sort()).toEqual(['filters', 'limit'])
  })

  it("envoie les secteurs croisés en CODES NAF, et rien quand aucun n'est coché", () => {
    // Le secteur ne voyage plus sous son nom : le backend le traduisait en une
    // SECTION NAF entière, si bien que « Industrie » couvrait les divisions 10
    // à 33. Il part en codes de classe, que le registre accepte en un seul
    // appel — mesuré le 04/09/2026 : `30.30Z,29.10Z` → 1423 = 745 + 678.
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), sectors: ['aerospace', 'defense'] }, NOW)
    expect(q.filters.nafCode).toBe('30.30Z,25.40Z,30.40Z')
    expect(q.filters.sectors).toBeUndefined()
    expect(buildRegistryQuery(emptyRegistryFilters(), NOW).filters.nafCode).toBeUndefined()
  })

  it("écarte « all » et les doublons — « all » est l'ABSENCE de contrainte, pas une valeur", () => {
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), sectors: ['aerospace', 'all', 'aerospace'] }, NOW)
    expect(q.filters.nafCode).toBe('30.30Z')
  })

  it('sends an explicit NAF code uppercased', () => {
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), nafCode: '62.02a' }, NOW).filters.nafCode).toBe('62.02A')
  })

  it('joint le NAF saisi à la main aux codes des secteurs, par un OU', () => {
    // C'est la seule chose que le registre sache faire en un appel — et c'est
    // aussi la lecture attendue : deux façons de dire « ce terrain m'intéresse ».
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), sectors: ['aerospace'], nafCode: '64.19z' }, NOW)
    expect(q.filters.nafCode).toBe('64.19Z,30.30Z')
  })

  // #3941.5 (Louis 17/10) — l'augmentation de capital (BODACC B) est un critère qui se COCHE.
  it('#3941.5 — « Augmentation de capital » part quand elle est cochée, et n’est jamais dans le défaut', () => {
    expect(buildSignalsQuery({ ...emptySignalsFilters(), sources: ['capital'] }).sources).toEqual(['capital'])
    expect(buildSignalsQuery({ ...emptySignalsFilters(), sources: ['hiring', 'capital'] }).sources).toEqual([
      'hiring',
      'capital',
    ])
    expect(emptySignalsFilters().sources).not.toContain('capital')
    expect(buildSignalsQuery({ ...emptySignalsFilters(), sources: [] }).sources).not.toContain('capital')
  })

  it('normalizes the department to a single code', () => {
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), department: '1' }, NOW).filters.department).toBe('01')
  })

  it('omits a department that does not normalize', () => {
    expect(
      buildRegistryQuery({ ...emptyRegistryFilters(), department: 'Paris' }, NOW).filters.department,
    ).toBeUndefined()
  })

  it('trims the city and omits it when blank', () => {
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), city: '  Lyon ' }, NOW).filters.city).toBe('Lyon')
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), city: '   ' }, NOW).filters.city).toBeUndefined()
  })

  it('translates a single headcount range into numeric bounds', () => {
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), headcount: ['50-249'] }, NOW).filters).toMatchObject({
      headcountMin: 50,
      headcountMax: 249,
    })
  })

  it('sends an open-ended maximum for the top bracket', () => {
    const filters = buildRegistryQuery({ ...emptyRegistryFilters(), headcount: ['1000+'] }, NOW).filters
    expect(filters.headcountMin).toBe(1000)
    expect(filters.headcountMax).toBeUndefined()
  })

  it('sends no headcount bound for an empty selection', () => {
    const filters = buildRegistryQuery({ ...emptyRegistryFilters(), headcount: [] }, NOW).filters
    expect(filters.headcountMin).toBeUndefined()
    expect(filters.headcountMax).toBeUndefined()
    expect(filters.headcountRanges).toBeUndefined()
  })

  // #3908 — deux tranches NON CONTIGUËS (10-49 + 250-499) ne doivent jamais se
  // réduire à l'intervalle enveloppe (10-499), qui remonterait aussi la
  // tranche 50-249 jamais cochée.
  it('sends the exact union for several non-contiguous ranges, never the envelope', () => {
    const filters = buildRegistryQuery({ ...emptyRegistryFilters(), headcount: ['10-49', '250-999'] }, NOW).filters
    expect(filters.headcountMin).toBeUndefined()
    expect(filters.headcountMax).toBeUndefined()
    expect(filters.headcountRanges).toEqual([
      { headcountMin: 10, headcountMax: 49 },
      { headcountMin: 250, headcountMax: 999 },
    ])
  })

  it('drops "any" and duplicates from the selection before building the query', () => {
    const filters = buildRegistryQuery({ ...emptyRegistryFilters(), headcount: ['any', '1-9', '1-9'] }, NOW).filters
    expect(filters).toMatchObject({ headcountMin: 1, headcountMax: 9 })
    expect(filters.headcountRanges).toBeUndefined()
  })

  it('translates the age bucket into absolute creation dates', () => {
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), age: 'lt3' }, NOW).filters).toEqual({
      createdAfter: '2023-07-19',
    })
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), age: '3to10' }, NOW).filters).toEqual({
      createdAfter: '2016-07-19',
      createdBefore: '2023-07-19',
    })
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), age: 'gt10' }, NOW).filters).toEqual({
      createdBefore: '2016-07-19',
    })
  })

  it('sends no creation window for "any"', () => {
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), age: 'any' }, NOW).filters).toEqual({})
  })

  // #3941.1 — seuil Jeune Entreprise Innovante (CGI art. 44 sexies-0 A), pas un âge deviné.
  it('translates the "lt8" bucket into a single creation floor, 8 years back', () => {
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), age: 'lt8' }, NOW).filters).toEqual({
      createdAfter: '2018-07-19',
    })
  })

  it('passes free text through as its own field, not as a prose sentence', () => {
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), freetext: '  migration SAP  ' }, NOW)
    expect(q.filters.freetext).toBe('migration SAP')
  })

  it('never concatenates criteria into prose', () => {
    const q = buildRegistryQuery(
      {
        ...emptyRegistryFilters(),
        sectors: ['retail_banking'],
        department: '75',
        city: 'Paris',
        headcount: ['50-249'],
        age: 'gt10',
      },
      NOW,
    )
    const serialized = JSON.stringify(q)
    expect(serialized).not.toContain('secteur :')
    expect(serialized).not.toContain('ville :')
  })

  // #2165.28 / #2165.30 — filtres serveur mémoire marché.
  it('sends the parsed technologies observed', () => {
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), technologiesObserved: 'java, react' }, NOW)
    expect(q.filters.technologiesObserved).toEqual(['java', 'react'])
  })

  it('sends externalRecourseObserved only when `true` — never `false` (doctrine c65, GA-259)', () => {
    const on = buildRegistryQuery({ ...emptyRegistryFilters(), externalRecourseObserved: true }, NOW)
    expect(on.filters.externalRecourseObserved).toBe(true)
    const off = buildRegistryQuery({ ...emptyRegistryFilters(), externalRecourseObserved: false }, NOW)
    expect(off.filters.externalRecourseObserved).toBeUndefined()
  })
})

describe('applyStartupSegment / isStartupSegmentActive (#3941.1, #3092)', () => {
  it('writes the three registry criteria the rail already shows — age, legal form, size under 250', () => {
    const next = applyStartupSegment(emptyRegistryFilters())
    expect(next.age).toBe('lt8')
    expect(next.legalForm).toBe('5710')
    // #4362.1 — la taille s'écrit en tranches visibles, plus en catégorie cachée.
    expect(next.headcount).toEqual(['1-9', '10-49', '50-249'])
    expect(next.companyCategory).toEqual([])
  })

  it('does not duplicate a range the user already ticked, and keeps the others', () => {
    const next = applyStartupSegment({ ...emptyRegistryFilters(), headcount: ['50-249', '250-999'] })
    expect(next.headcount).toEqual(['50-249', '250-999', '1-9', '10-49'])
  })

  it('reads active only when all three criteria are still exactly the preset ones', () => {
    expect(isStartupSegmentActive(emptyRegistryFilters())).toBe(false)
    expect(isStartupSegmentActive(applyStartupSegment(emptyRegistryFilters()))).toBe(true)
    // L'utilisateur repasse l'âge à "tous" : le préréglage n'est plus actif,
    // même si la forme et la catégorie n'ont pas bougé — les TROIS comptent.
    expect(isStartupSegmentActive({ ...applyStartupSegment(emptyRegistryFilters()), age: 'any' })).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  isRegistryQueryRunnable                                            */
/* ------------------------------------------------------------------ */

describe('isRegistryQueryRunnable', () => {
  it('refuses an entirely empty filter set (that is a registry dump, not a search)', () => {
    expect(isRegistryQueryRunnable(emptyRegistryFilters())).toBe(false)
  })

  it.each([
    ['sectors', { sectors: ['retail_banking'] }],
    ['nafCode', { nafCode: '62.02A' }],
    ['department', { department: '75' }],
    ['city', { city: 'Lyon' }],
    ['headcount', { headcount: ['1-9' as const] }],
    ['age', { age: 'gt10' as const }],
    ['freetext', { freetext: 'SAP' }],
  ])('accepts as soon as %s is set', (_label, patch) => {
    expect(isRegistryQueryRunnable({ ...emptyRegistryFilters(), ...patch })).toBe(true)
  })

  it('does not count a department string that normalizes to nothing', () => {
    expect(isRegistryQueryRunnable({ ...emptyRegistryFilters(), department: 'Paris' })).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  buildSignalsQuery                                                  */
/* ------------------------------------------------------------------ */

describe('buildSignalsQuery', () => {
  it('defaults to the three sources over a 90-day window', () => {
    expect(buildSignalsQuery(emptySignalsFilters())).toEqual({
      sources: ['tender', 'award', 'hiring'],
      sinceDays: 90,
      limit: 24,
    })
  })

  it('sends the selected sources in contract order', () => {
    expect(buildSignalsQuery({ ...emptySignalsFilters(), sources: ['hiring', 'tender'] }).sources).toEqual([
      'tender',
      'hiring',
    ])
  })

  it('falls back to every source when the rep unselects them all', () => {
    expect(buildSignalsQuery({ ...emptySignalsFilters(), sources: [] }).sources).toEqual(['tender', 'award', 'hiring'])
  })

  it('normalizes the department to a single code', () => {
    expect(buildSignalsQuery({ ...emptySignalsFilters(), department: '69' }).department).toBe('69')
    expect(buildSignalsQuery({ ...emptySignalsFilters(), department: 'Lyon' }).department).toBeUndefined()
  })

  it('carries the chosen recency window', () => {
    expect(buildSignalsQuery({ ...emptySignalsFilters(), sinceDays: 30 }).sinceDays).toBe(30)
  })

  it('sends trimmed keywords, omitting them when blank', () => {
    expect(buildSignalsQuery({ ...emptySignalsFilters(), keywords: ' data ' }).keywords).toBe('data')
    expect(buildSignalsQuery({ ...emptySignalsFilters(), keywords: '  ' }).keywords).toBeUndefined()
  })

  // #2165.28 / #2165.30 — filtres serveur mémoire marché.
  it('sends the parsed technologies observed', () => {
    expect(
      buildSignalsQuery({ ...emptySignalsFilters(), technologiesObserved: 'java, react' }).technologiesObserved,
    ).toEqual(['java', 'react'])
  })

  it('sends externalRecourseObserved only when `true` — never `false` (doctrine c65, GA-259)', () => {
    expect(
      buildSignalsQuery({ ...emptySignalsFilters(), externalRecourseObserved: true }).externalRecourseObserved,
    ).toBe(true)
    expect(
      buildSignalsQuery({ ...emptySignalsFilters(), externalRecourseObserved: false }).externalRecourseObserved,
    ).toBeUndefined()
  })

  /**
   * #3096 / #3097 — RÉFUTÉ en prod le 27/09 : la politique de télétravail et la
   * séniorité cochées au rail n'atteignaient JAMAIS `POST /ia/discover/signals`
   * (`DiscoverSignalsRequest.remotePolicies` / `.seniorities` restaient donc
   * toujours vides), alors que le serveur les applique AVANT de tronquer à
   * `limit` — les envoyer est ce qui rend le croisement écran cohérent avec la
   * page réellement rendue.
   */
  it('sends the checked remote work policies', () => {
    expect(buildSignalsQuery({ ...emptySignalsFilters(), remotePolicies: ['full_remote'] }).remotePolicies).toEqual([
      'full_remote',
    ])
    expect(buildSignalsQuery(emptySignalsFilters()).remotePolicies).toBeUndefined()
  })

  it('sends the checked seniorities', () => {
    expect(buildSignalsQuery({ ...emptySignalsFilters(), seniorities: ['senior'] }).seniorities).toEqual(['senior'])
    expect(buildSignalsQuery(emptySignalsFilters()).seniorities).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */
/*  #2165.28 — parseTechnologiesObserved                               */
/* ------------------------------------------------------------------ */

describe('parseTechnologiesObserved', () => {
  it('splits on commas and semicolons, trimming each token', () => {
    expect(parseTechnologiesObserved('java, react; sql')).toEqual(['java', 'react', 'sql'])
  })

  it('drops empty tokens and duplicates', () => {
    expect(parseTechnologiesObserved('java,, java')).toEqual(['java'])
  })

  it('returns an empty list for blank input', () => {
    expect(parseTechnologiesObserved('   ')).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  #3983.2 — siège ou implantation                                    */
/* ------------------------------------------------------------------ */

describe('buildRegistryQuery — site basis (#3983.2)', () => {
  it('sends siteBasis only for the headquarters basis, on a zone', () => {
    const query = buildRegistryQuery({ ...emptyRegistryFilters(), department: '69', siteBasis: 'headquarters' }, NOW)
    expect(query.filters.siteBasis).toBe('headquarters')
    const byRegion = buildRegistryQuery({ ...emptyRegistryFilters(), region: ['84'], siteBasis: 'headquarters' }, NOW)
    expect(byRegion.filters.siteBasis).toBe('headquarters')
  })

  it('presence is the registry default: nothing is sent', () => {
    const query = buildRegistryQuery({ ...emptyRegistryFilters(), department: '69', siteBasis: 'presence' }, NOW)
    expect('siteBasis' in query.filters).toBe(false)
    expect(emptyRegistryFilters().siteBasis).toBe('presence')
  })

  it('a basis without a zone has nothing to base: it is not sent', () => {
    const query = buildRegistryQuery({ ...emptyRegistryFilters(), nafCode: '62.02A', siteBasis: 'headquarters' }, NOW)
    expect('siteBasis' in query.filters).toBe(false)
  })
})

describe('#4361.2 — « Exclure les sociétés cotées » part à la recherche', () => {
  it('seul `true` est envoyé : décoché n’affirme jamais « non cotée »', () => {
    expect(buildRegistryQuery({ ...emptyRegistryFilters(), excludeListed: true }, NOW).filters.excludeListed).toBe(true)
    expect(
      'excludeListed' in buildRegistryQuery({ ...emptyRegistryFilters(), excludeListed: false }, NOW).filters,
    ).toBe(false)
  })

  it('la tranche « 250-4999 » est UN intervalle 250 à 4 999', () => {
    const { filters } = buildRegistryQuery({ ...emptyRegistryFilters(), headcount: ['250-4999'] }, NOW)
    expect(filters.headcountMin).toBe(250)
    expect(filters.headcountMax).toBe(4999)
  })

  it('se combine avec n’importe quelle tranche, sans la modifier', () => {
    const { filters } = buildRegistryQuery(
      { ...emptyRegistryFilters(), headcount: ['50-249'], excludeListed: true },
      NOW,
    )
    expect(filters).toMatchObject({ headcountMin: 50, headcountMax: 249, excludeListed: true })
  })

  it('un interrupteur seul est un critère réel (pas un dump de registre… ni un rail vide)', () => {
    expect(isRegistryQueryRunnable({ ...emptyRegistryFilters(), excludeListed: true })).toBe(true)
  })
})
