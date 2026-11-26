import {
  formatSiren,
  normalizeDiscoverResponse,
  scoreFactorTotal,
  sortSignalsByDate,
  sortSignalsForDisplay,
} from './discover-normalize'

const rawCandidate = {
  name: 'ACME Industries',
  siren: '552100554',
  nafCode: '62.02A',
  sector: 'Conseil en systèmes informatiques',
  city: 'Lyon',
  department: '69',
  headcountRange: '250-999',
  creationDate: '1998-04-12',
  score: 72,
  scoreFactors: [{ label: 'NAF 62.02 exact', points: 25, evidence: '62.02A' }],
  signals: [{ type: 'tender', label: 'AO IT publié', date: '2026-07-07' }],
  angle: 'Modernisation du SI RH',
  suggestedRoles: [{ title: 'DSI', department: 'IT' }],
  portfolioState: 'new',
  accountId: null,
  sources: [{ name: 'recherche-entreprises', fetchedAt: '2026-07-19T08:00:00Z' }],
}

describe('normalizeDiscoverResponse', () => {
  it('keeps a well-formed candidate intact', () => {
    const res = normalizeDiscoverResponse({ candidates: [rawCandidate], query: { limit: 24 }, degraded: [] })
    expect(res.candidates).toHaveLength(1)
    expect(res.candidates[0]).toMatchObject({ name: 'ACME Industries', siren: '552100554', score: 72 })
  })

  /**
   * #3877.4 — le nombre d'établissements voyage AVEC le candidat (déjà calculé
   * côté IA), mais cette fonction reconstruit `DiscoverCandidate` CHAMP PAR
   * CHAMP et l'oubli ici referme la chaîne aussi sûrement qu'une absence côté
   * backend — même défaut déjà nommé pour `isIntermediary`/`qualification`.
   */
  it('#3705.5 — recopie le lien de groupe sourcé, rejette un genre inconnu ou une liste vide', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, groupLink: { kind: 'capital_link', entities: ['GROUPE X', '', 3] } },
        { ...rawCandidate, siren: '552100555', groupLink: { kind: 'deviné', entities: ['Z'] } },
        { ...rawCandidate, siren: '552100556', groupLink: { kind: 'capital_link', entities: [] } },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.groupLink).toEqual({ kind: 'capital_link', entities: ['GROUPE X'] })
    expect(res.candidates[1]?.groupLink).toBeUndefined()
    expect(res.candidates[2]?.groupLink).toBeUndefined()
  })

  it('#3877.4 — recopie le nombre d’établissements, jamais 0 sur une valeur absente', () => {
    const withCount = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, establishmentCount: 12 }],
      query: {},
      degraded: [],
    })
    expect(withCount.candidates[0]?.establishmentCount).toBe(12)

    const withoutCount = normalizeDiscoverResponse({
      candidates: [rawCandidate],
      query: {},
      degraded: [],
    })
    expect(withoutCount.candidates[0]?.establishmentCount).toBeNull()
  })

  it('#4358.4 — la provenance du secteur passe quand elle est connue, jamais inventée', () => {
    const run = (extra: Record<string, unknown>) =>
      normalizeDiscoverResponse({ candidates: [{ ...rawCandidate, ...extra }], query: {}, degraded: [] }).candidates[0]
    expect(run({ sector: 'Conseil', sectorBasis: 'naf' })?.sectorBasis).toBe('naf')
    expect(run({ sector: 'Conseil', sectorBasis: 'rumeur' })?.sectorBasis).toBeUndefined()
    expect(run({ sector: null, sectorBasis: 'naf' })?.sectorBasis).toBeUndefined()
  })

  it('#3877.4 — une valeur négative ou illisible n’est jamais affichée comme un compte', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, establishmentCount: -3 },
        { ...rawCandidate, siren: '552100555', establishmentCount: 'beaucoup' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.establishmentCount).toBeNull()
    expect(res.candidates[1]?.establishmentCount).toBeNull()
  })

  it('#3237 — recopie le delivery fit et les treize axes du signal (recette Y11 : la ligne Aubrac ne les portait pas)', () => {
    const axes = { site_presence: 'incompatible', clearances: 'incompatible', languages: 'unknown' }
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          signals: [
            {
              type: 'hiring',
              label: '9 offres ouvertes',
              date: '2026-07-07',
              deliveryFit: 'incompatible',
              deliveryFitAxes: axes,
            },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.signals[0]).toMatchObject({ deliveryFit: 'incompatible', deliveryFitAxes: axes })
  })

  it('#3237 — un niveau inconnu du contrat est écarté, jamais cru ; sans delivery fit, aucune clé', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          signals: [
            {
              type: 'hiring',
              label: 'A',
              date: '2026-07-07',
              deliveryFit: 'parfait',
              deliveryFitAxes: { languages: 'parfait', security: 'compatible' },
            },
            { type: 'hiring', label: 'B', date: '2026-07-07' },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    const [first, second] = res.candidates[0]?.signals ?? []
    expect(first?.deliveryFit).toBeUndefined()
    expect(first?.deliveryFitAxes).toEqual({ security: 'compatible' })
    expect(second).not.toHaveProperty('deliveryFit')
    expect(second).not.toHaveProperty('deliveryFitAxes')
  })

  it('#3408 — recopie les technologies nommées par le signal et la pile observée du candidat (« Périmètre conseillé »)', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          technologiesObserved: ['Python', ' ', 42, 'Kafka'],
          signals: [
            { type: 'hiring', label: 'A', date: '2026-07-07', technologies: ['Python', 'Airflow', 7] },
            { type: 'hiring', label: 'B', date: '2026-07-07', technologies: [] },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    const candidate = res.candidates[0]
    expect(candidate?.technologiesObserved).toEqual(['Python', 'Kafka'])
    expect(candidate?.signals[0]?.technologies).toEqual(['Python', 'Airflow'])
    expect(candidate?.signals[1]).not.toHaveProperty('technologies')
  })

  it('#3408 — sans technologie, aucune clé (jamais une pile devinée)', () => {
    const res = normalizeDiscoverResponse({ candidates: [rawCandidate], query: {}, degraded: [] })
    expect(res.candidates[0]).not.toHaveProperty('technologiesObserved')
    expect(res.candidates[0]?.signals[0]).not.toHaveProperty('technologies')
  })

  /* --- La règle cardinale du contrat --- */

  it('drops a candidate with no SIREN — le registre produit la liste', () => {
    const res = normalizeDiscoverResponse({
      candidates: [rawCandidate, { ...rawCandidate, name: 'Fabricant Fenêtres', siren: '' }],
      query: {},
      degraded: [],
    })
    expect(res.candidates.map(c => c.name)).toEqual(['ACME Industries'])
  })

  it('drops a candidate whose SIREN is not 9 digits', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '5521' },
        { ...rawCandidate, siren: 'INCONNU' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates).toEqual([])
  })

  it('strips spaces and dots from a SIREN before validating it', () => {
    const res = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, siren: '552 100 554' }],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.siren).toBe('552100554')
  })

  it('drops a candidate with no name', () => {
    const res = normalizeDiscoverResponse({ candidates: [{ ...rawCandidate, name: '  ' }], query: {}, degraded: [] })
    expect(res.candidates).toEqual([])
  })

  it('de-duplicates on SIREN, keeping the first (best-ranked) occurrence', () => {
    const res = normalizeDiscoverResponse({
      candidates: [rawCandidate, { ...rawCandidate, name: 'ACME INDUSTRIES SA' }],
      query: {},
      degraded: [],
    })
    expect(res.candidates).toHaveLength(1)
    expect(res.candidates[0]?.name).toBe('ACME Industries')
  })

  /* --- Champs factuels : null plutôt qu'inventé --- */

  it('nulls every missing registry field instead of faking one', () => {
    const res = normalizeDiscoverResponse({
      candidates: [{ name: 'X', siren: '552100554' }],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]).toMatchObject({
      nafCode: null,
      sector: null,
      city: null,
      department: null,
      headcountRange: null,
      creationDate: null,
      angle: null,
      accountId: null,
    })
  })

  it('defaults collections to empty arrays, never undefined', () => {
    const res = normalizeDiscoverResponse({ candidates: [{ name: 'X', siren: '552100554' }], query: {}, degraded: [] })
    expect(res.candidates[0]).toMatchObject({ scoreFactors: [], signals: [], suggestedRoles: [], sources: [] })
  })

  it('clamps the score into 0-100', () => {
    const parsed = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '111111111', score: 300 },
        { ...rawCandidate, siren: '222222222', score: -12 },
      ],
      query: {},
      degraded: [],
    })
    expect(parsed.candidates.map(c => c.score)).toEqual([100, 0])
  })

  /* --- « Pas de score » n'est pas « un score de zéro » --- */

  it('keeps an absent score NULL instead of turning it into a 0/100', () => {
    // C'est le bug vécu : le backend n'envoyait pas de score, la normalisation
    // le remplaçait par 0, et l'écran affichait « 0/100 » pour chaque
    // entreprise trouvée — un chiffre qui a l'air mesuré alors que rien ne
    // l'était. Un `null` se rend « indisponible » ; un `0` ment.
    const parsed = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '333333333', score: undefined },
        { ...rawCandidate, siren: '444444444', score: null },
      ],
      query: {},
      degraded: [],
    })
    expect(parsed.candidates.map(c => c.score)).toEqual([null, null])
  })

  it('carries the real denominator and the unmeasured criteria', () => {
    const parsed = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, score: 45, scoreMax: 75, scoreUnmeasured: ['age', 'headcount'] }],
      query: {},
      degraded: [],
    })
    expect(parsed.candidates[0].scoreMax).toBe(75)
    expect(parsed.candidates[0].scoreUnmeasured).toEqual(['age', 'headcount'])
  })

  it('defaults scoreMax to 100 only when a score was actually produced', () => {
    const parsed = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '111111111', score: 40, scoreMax: undefined },
        { ...rawCandidate, siren: '222222222', score: null, scoreMax: undefined },
      ],
      query: {},
      degraded: [],
    })
    expect(parsed.candidates.map(c => c.scoreMax)).toEqual([100, null])
  })

  it('drops a signal with no date — a signal without a date is not a signal', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          signals: [
            { type: 'tender', label: 'AO IT publié', date: '2026-07-07' },
            { type: 'hiring', label: 'recrute', date: '' },
            { type: 'hiring', label: 'recrute encore' },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.signals).toHaveLength(1)
  })

  // #2165.46 — MÊME défaut que `block`/`barrier` documenté plus haut dans ce
  // fichier : un champ recopié champ par champ que le normaliseur oublie
  // n'atteint JAMAIS l'écran, silencieusement. `intermediated` est déclaré au
  // contrat (`discoverSignalSchema`) depuis le tome 2 §13 et n'était ni
  // mirroré dans `DiscoverSignal` (web) ni recopié ici — le « niveau de
  // preuve » ne pouvait donc rien filtrer : la donnée n'arrivait jamais.
  it('carries `intermediated` through — le niveau de preuve ne peut pas filtrer un champ mort en chemin', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          signals: [
            { type: 'hiring', label: 'recrute via cabinet', date: '2026-07-07', intermediated: true },
            { type: 'tender', label: 'AO direct', date: '2026-07-06', intermediated: false },
            { type: 'award', label: 'marché attribué', date: '2026-07-05' },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.signals.map(s => s.intermediated)).toEqual([true, false, undefined])
  })

  // #4045.3 (recette M 12/10 : « aucun effet, même ordre ») — le serveur pose `keywordMatch` sur les signaux
  // qui recoupent le mot-clé ; le normaliseur le perdait (champ recopié champ par champ) ET l'écran retriait
  // tout par date : le tri par mot-clé ne pouvait jamais se voir.
  it('#4045.3 — carries `keywordMatch` through, et seulement quand il est vrai', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          signals: [
            { type: 'hiring', label: 'Ingénieur SOC', date: '2026-07-01', keywordMatch: true },
            { type: 'tender', label: 'AO', date: '2026-07-06' },
            { type: 'award', label: 'marché', date: '2026-07-05', keywordMatch: 'oui' },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.signals.map(s => s.keywordMatch)).toEqual([true, undefined, undefined])
  })

  it('#4115 — carries `tier` (strong | context) through, rien d’autre', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          signals: [
            { type: 'hiring', label: 'A', date: '2026-07-01', tier: 'strong' },
            { type: 'tech', label: 'B', date: '2026-07-02', tier: 'context' },
            { type: 'award', label: 'C', date: '2026-07-05', tier: 'probable' },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.signals.map(s => s.tier)).toEqual(['strong', 'context', undefined])
  })

  it('#4115 — la grille garde les faits `business` et `funding` (jamais retirés en silence)', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          signals: [
            { type: 'funding', label: 'Levée', date: '2026-09-02', tier: 'strong' },
            { type: 'business', label: 'Nomination', date: '2026-08-28', tier: 'strong' },
            { type: 'business', label: 'Salon', date: '2026-06-22', tier: 'context' },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.signals.map(s => s.label)).toEqual(['Levée', 'Nomination', 'Salon'])
  })

  it('#4045.3 — sortSignalsForDisplay : le recoupement du mot-clé d’abord, puis du plus récent au plus ancien', () => {
    const signals = [
      { type: 'tender', label: 'AO récent', date: '2026-07-09' },
      { type: 'hiring', label: 'SOC ancien', date: '2026-06-01', keywordMatch: true },
      { type: 'hiring', label: 'SOC récent', date: '2026-07-01', keywordMatch: true },
      { type: 'award', label: 'marché', date: '2026-07-05' },
    ] as const
    expect(sortSignalsForDisplay(signals).map(s => s.label)).toEqual([
      'SOC récent',
      'SOC ancien',
      'AO récent',
      'marché',
    ])
    // Sans mot-clé : exactement l'ordre par date d'avant (byte-identique).
    const plain = signals.map(({ type, label, date }) => ({ type, label, date }))
    expect(sortSignalsForDisplay(plain)).toEqual(sortSignalsByDate(plain))
  })

  // #2616.2 — MÊME défaut, un cran plus loin : `publicEmployer` n'était NI
  // déclaré au contrat, NI mirroré dans `DiscoverSignal` (web), NI recopié
  // ici. Le filtre qui exclut l'employeur public du signal `hiring` ne
  // pouvait donc voir passer aucune donnée, quel que soit ce que l'IA calcule.
  it('carries `publicEmployer` through — sans lui, aucun employeur public ne peut être exclu', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          signals: [
            { type: 'hiring', label: '12 postes ouverts', date: '2026-07-07', publicEmployer: true },
            { type: 'hiring', label: '4 postes data', date: '2026-07-06', publicEmployer: false },
            { type: 'award', label: 'marché attribué', date: '2026-07-05' },
          ],
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.signals.map(s => s.publicEmployer)).toEqual([true, false, undefined])
  })

  // #2265.14 — MÊME défaut que `qualification` (#2614.1) : `isIntermediary`
  // voyageait depuis l'IA sans que cette fonction ne le recopie sur
  // `DiscoverCandidate`, ce qui aurait rendu tout badge impossible quel que
  // soit ce que le backend calcule.
  it('carries `isIntermediary` through — sans lui, le badge « pas client final » ne peut voir aucune donnée', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '552144503', isIntermediary: true },
        { ...rawCandidate, siren: '552100554', isIntermediary: false },
        { ...rawCandidate, siren: '552100555' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates.map(c => c.isIntermediary)).toEqual([true, false, undefined])
  })

  // #3819.1 — même défaut de famille : un champ voyagé depuis l'API sans que
  // cette fonction ne le recopie n'atteint jamais l'écran.
  it('carries `knownNeedsCount` through, 0 compris — un fait mesuré, jamais une absence', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '552144503', knownNeedsCount: 3 },
        { ...rawCandidate, siren: '552100554', knownNeedsCount: 0 },
        { ...rawCandidate, siren: '552100555' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates.map(c => c.knownNeedsCount)).toEqual([3, 0, undefined])
  })

  // #4067 — même défaut de famille : les axes de sources voyagent depuis l'API.
  it('carries `sourceAxes` through when valid, drops a malformed one (never a guessed axis)', () => {
    const sourceAxes = {
      score: 10,
      max: 20,
      axes: [{ key: 'crm', points: 10, max: 20, measured: true, evidence: 'x', label_key: 'crm_won', latestAt: null }],
      unmeasured: ['signal_history', 'market_memory', 'dataforge', 'drive', 'missions'],
    }
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '552144503', sourceAxes },
        { ...rawCandidate, siren: '552100554', sourceAxes: { score: 'beaucoup' } },
        { ...rawCandidate, siren: '552100555' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates.map(c => c.sourceAxes?.score)).toEqual([10, undefined, undefined])
  })

  // #3757 (reste) — même défaut que ci-dessus, pour le fait DÉCLARÉ.
  it('carries `isDeclaredPartner` through — même chaîne coupée que `isEsnPeer`', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '552144503', isDeclaredPartner: true },
        { ...rawCandidate, siren: '552100554', isDeclaredPartner: false },
        { ...rawCandidate, siren: '552100555' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates.map(c => c.isDeclaredPartner)).toEqual([true, false, undefined])
  })

  // #3819 — recette MO 10/10 : « Non cherché : offres » sur Castelnau alors que l'API semait
  // `signalsSearched: true`. La normalisation reconstruit le candidat CHAMP PAR CHAMP et jetait
  // ce fait : « cherché, rien trouvé » se lisait « jamais interrogé » (même chaîne coupée).
  it('#3819 — carries `signalsSearched` through, true AND false, absent stays absent', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '552144503', signalsSearched: true },
        { ...rawCandidate, siren: '552100554', signalsSearched: false },
        { ...rawCandidate, siren: '552100555' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates.map(c => c.signalsSearched)).toEqual([true, false, undefined])
  })

  // DISCOVER-OFFRES (15/10) — le volume voyage tel que mesuré ; nul, négatif ou mal formé = aucune ligne.
  it('DISCOVER-OFFRES — carries a measured `offersVolume`, never a zero or a malformed one', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, siren: '552144503', offersVolume: { count: 179, windowDays: 90, country: 'FR' } },
        { ...rawCandidate, siren: '552100554', offersVolume: { count: 0, windowDays: 90, country: 'FR' } },
        { ...rawCandidate, siren: '552100555', offersVolume: 'beaucoup' },
        { ...rawCandidate, siren: '552100556' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates.map(c => c.offersVolume)).toEqual([
      { count: 179, windowDays: 90, country: 'FR' },
      undefined,
      undefined,
      undefined,
    ])
  })

  it('drops a signal whose type is outside the contract enum', () => {
    const res = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, signals: [{ type: 'vibes', label: 'ça sent bon', date: '2026-07-07' }] }],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.signals).toEqual([])
  })

  it('falls back to "new" for an unknown portfolioState', () => {
    const res = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, portfolioState: 'prospect' }],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.portfolioState).toBe('new')
  })

  /* --- degraded --- */

  it('preserves degraded entries verbatim', () => {
    const res = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [{ source: 'BOAMP', reason: 'timeout' }],
    })
    expect(res.degraded).toEqual([{ source: 'BOAMP', reason: 'timeout' }])
  })

  it('drops a degraded entry with no source name', () => {
    const res = normalizeDiscoverResponse({ candidates: [], query: {}, degraded: [{ source: '', reason: 'x' }] })
    expect(res.degraded).toEqual([])
  })

  /* --- robustesse --- */

  it('survives a null / malformed payload without throwing', () => {
    // `coverage: null` = le backend n'a rien dit sur sa couverture. C'est bien
    // `null` et non un bloc à zéro : « on ne sait pas ce qui a été couvert » ne
    // doit pas se lire « 0 entreprise non examinée ».
    expect(normalizeDiscoverResponse(null)).toEqual({ candidates: [], query: {}, degraded: [], coverage: null })
    expect(normalizeDiscoverResponse({ candidates: 'nope' })).toEqual({
      candidates: [],
      query: {},
      degraded: [],
      coverage: null,
    })
  })

  /* --- #2614.1 — le verdict du conseil de qualification ---------------- */

  // Mesuré en production le 20/09 : `apps/ia/app/routers/discover.py` pose
  // `qualification` sur chaque candidat (ligne 1382), mais cette fonction ne
  // le lisait jamais — la chaîne coupée. `hiddenCandidatesBreakdown` comptait
  // donc TOUJOURS 0 exclu, sur les cinq sous-onglets, quel que soit le
  // verdict réel.
  it('#2120.57 / #2614.1 — lit le verdict de qualification posé par l’IA, jamais fondu en silence', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          qualification: { verdict: 'excluded', code: 'natural_person', reason: 'Personne physique', otherCodes: [] },
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.qualification).toEqual({
      verdict: 'excluded',
      code: 'natural_person',
      reason: 'Personne physique',
      otherCodes: [],
    })
  })

  it('un verdict absent reste absent — jamais un verdict inventé', () => {
    const res = normalizeDiscoverResponse({ candidates: [rawCandidate], query: {}, degraded: [] })
    expect(res.candidates[0]?.qualification).toBeUndefined()
    expect('qualification' in (res.candidates[0] ?? {})).toBe(false)
  })

  it('un verdict illisible (hors énum) reste absent, jamais deviné', () => {
    const res = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, qualification: { verdict: 'maybe', reason: 'x' } }],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.qualification).toBeUndefined()
  })

  it('keeps the normalized query the backend echoed back', () => {
    expect(normalizeDiscoverResponse({ candidates: [], query: { departments: ['75'] }, degraded: [] }).query).toEqual({
      departments: ['75'],
    })
  })

  /* --- #2489.3/D1 — la cible déclarée filtre toujours ---------------- */

  it('reads the target sector filter counter — not decorative', () => {
    const res = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [],
      targetSectorFilter: { applied: true, excludedCount: 3, excludedSectors: ['Restauration rapide'] },
    })
    expect(res.targetSectorFilter).toEqual({
      applied: true,
      excludedCount: 3,
      excludedSectors: ['Restauration rapide'],
    })
  })

  it('sait dire NON : sans cible déclarée, pas de compteur du tout (jamais {applied:false, excludedCount:0})', () => {
    const res = normalizeDiscoverResponse({ candidates: [], query: {}, degraded: [] })
    expect(res.targetSectorFilter).toBeUndefined()
    expect('targetSectorFilter' in res).toBe(false)
  })

  it('un `targetSectorFilter` illisible (sans `applied` booléen) reste absent, jamais inventé', () => {
    const res = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [],
      targetSectorFilter: { excludedCount: 3 },
    })
    expect(res.targetSectorFilter).toBeUndefined()
  })
})

describe('normalizeDiscoverResponse — les champs d’extraction du signal atteignent l’écran (#3238)', () => {
  const run = (signals: unknown[], extra: Record<string, unknown> = {}) =>
    normalizeDiscoverResponse({ candidates: [{ ...rawCandidate, signals, ...extra }], query: {}, degraded: [] })
      .candidates[0]

  it('recopie siteCity et les champs #3203/#3204 — sans eux la puce « Sites » ne peut jamais s’afficher', () => {
    const signal = run([
      {
        type: 'hiring',
        label: 'Data engineer',
        date: '2026-06-20',
        siteCity: 'Lyon',
        technologies: ['Kafka', 7],
        jobFamily: 'data_ia',
        team: 'data',
        reportsTo: 'DSI',
        stillOpen: true,
        similarOfferCount: 1,
        thirdPartyProviderMention: 'sopra steria',
        hiringSignalClass: 'internal_hiring',
        deliveryFit: 'compatible',
        deliveryFitAxes: { languages: 'compatible', bogus: 'nope' },
        contractType: 'CDI',
        remoteWorkPolicy: 'hybride',
        seniority: 'senior',
        salaryLabel: '55 k€',
        replacementSignal: true,
      },
    ])?.signals[0]
    expect(signal).toMatchObject({
      siteCity: 'Lyon',
      technologies: ['Kafka'],
      jobFamily: 'data_ia',
      team: 'data',
      reportsTo: 'DSI',
      stillOpen: true,
      similarOfferCount: 1,
      thirdPartyProviderMention: 'sopra steria',
      hiringSignalClass: 'internal_hiring',
      deliveryFit: 'compatible',
      deliveryFitAxes: { languages: 'compatible' },
      contractType: 'CDI',
      remoteWorkPolicy: 'hybride',
      seniority: 'senior',
      salaryLabel: '55 k€',
      replacementSignal: true,
    })
  })

  it('sait dire NON : rien d’inventé, une valeur hors contrat n’est pas recopiée', () => {
    const signal = run([
      { type: 'hiring', label: 'x', date: '2026-06-20', siteCity: '  ', seniority: 'dieu', hiringSignalClass: 'zzz' },
    ])?.signals[0]
    expect(signal).not.toHaveProperty('siteCity')
    expect(signal).not.toHaveProperty('seniority')
    expect(signal).not.toHaveProperty('hiringSignalClass')
  })

  it('#4182 — recopie le dossier demandeur ; un statut hors contrat ou une étape inconnue ne passent pas', () => {
    const signal = run([
      {
        type: 'hiring',
        label: 'x',
        date: '2026-06-20',
        requester: {
          author: { kind: 'cabinet' },
          possibleManager: { function: 'cto', entity: 'Lyon', evidence: 'texte_de_l_offre' },
          team: 'data',
          scope: { city: 'Lyon' },
          status: 'etaye',
          method: ['lire_offre', 'inventee'],
          openFreelanceMission: false,
        },
      },
      { type: 'hiring', label: 'y', date: '2026-06-20', requester: { status: 'certain', author: { kind: 'rh' } } },
    ])?.signals
    expect(signal?.[0]?.requester).toEqual({
      author: 'cabinet',
      possibleManagerFunction: 'cto',
      team: 'data',
      city: 'Lyon',
      status: 'etaye',
      method: ['lire_offre'],
    })
    expect(signal?.[1]).not.toHaveProperty('requester')
  })

  it('recopie aggregatedSignals (offres citées en preuve) et écarte une classe inconnue', () => {
    const candidate = run([], {
      aggregatedSignals: [
        {
          aggregateClass: 'team_growth_signal',
          jobFamily: 'data_ia',
          supportingOffers: [
            { label: 'A', date: '2026-06-20' },
            { label: '', date: '2026-06-01' },
          ],
          reason: 'Deux offres data.',
        },
        { aggregateClass: 'inconnue', jobFamily: 'x', supportingOffers: [], reason: 'r' },
      ],
    })
    expect(candidate?.aggregatedSignals).toEqual([
      {
        aggregateClass: 'team_growth_signal',
        jobFamily: 'data_ia',
        supportingOffers: [{ label: 'A', date: '2026-06-20' }],
        reason: 'Deux offres data.',
      },
    ])
  })
})

describe('sortSignalsByDate', () => {
  it('orders the most recent signal first', () => {
    const sorted = sortSignalsByDate([
      { type: 'hiring', label: 'a', date: '2026-01-02' },
      { type: 'tender', label: 'b', date: '2026-07-01' },
      { type: 'award', label: 'c', date: '2026-03-15' },
    ])
    expect(sorted.map(s => s.label)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate the input array', () => {
    const input = [
      { type: 'hiring' as const, label: 'a', date: '2026-01-02' },
      { type: 'tender' as const, label: 'b', date: '2026-07-01' },
    ]
    sortSignalsByDate(input)
    expect(input[0]?.label).toBe('a')
  })
})

describe('scoreFactorTotal', () => {
  it('sums signed contributions', () => {
    expect(
      scoreFactorTotal([
        { label: 'a', points: 25 },
        { label: 'b', points: -5 },
      ]),
    ).toBe(20)
  })

  it('is 0 for no factor', () => {
    expect(scoreFactorTotal([])).toBe(0)
  })
})

describe('formatSiren', () => {
  it('groups a SIREN in threes for readability', () => {
    expect(formatSiren('552100554')).toBe('552 100 554')
  })

  it('returns unexpected input untouched rather than mangling it', () => {
    expect(formatSiren('55210')).toBe('55210')
  })
})

/* ------------------------------------------------------------------ */
/*  Le SECOND nombre et la clé de bloc (tome 1, recette live du 22/08). */
/*                                                                     */
/*  Le normaliseur recopie champ par champ : deux clés ajoutées par le  */
/*  backend n'étaient pas dans la liste, donc elles n'atteignaient      */
/*  jamais l'écran. Conséquence visible : CHAQUE compte affichait       */
/*  « À investiguer » (la famille se déduit de l'adressabilité, reçue   */
/*  `undefined`), les tris « Accès » et « Équilibré » ne triaient rien, */
/*  et le second nombre — la thèse du tome — ne s'affichait nulle part. */
/* ------------------------------------------------------------------ */
describe('normalizeDiscoverResponse — adressabilité et bloc de barème', () => {
  const withAddressability = {
    ...rawCandidate,
    scoreFactors: [{ label: 'NAF 62.02 exact', points: 25, evidence: '62.02A', block: 'activity' }],
    addressability: {
      score: 11,
      max: 11,
      unmeasured: ['path', 'relation', 'access_cost'],
      factors: [
        {
          label: 'Consultation ouverte — la porte l’est aussi',
          points: 6,
          evidence: 'appel d’offres publié : AO IT (2026-08-22)',
          block: 'accessibility',
          axis: 'lock',
        },
      ],
    },
  }

  it('carries the addressability block through', () => {
    const { candidates } = normalizeDiscoverResponse({ candidates: [withAddressability] })
    expect(candidates[0]?.addressability).toEqual({
      score: 11,
      max: 11,
      unmeasured: ['path', 'relation', 'access_cost'],
      factors: [
        {
          label: 'Consultation ouverte — la porte l’est aussi',
          points: 6,
          evidence: 'appel d’offres publié : AO IT (2026-08-22)',
          axis: 'lock',
          block: 'accessibility',
        },
      ],
    })
  })

  it('carries the score block key, so a factor is not filed under « divers »', () => {
    const { candidates } = normalizeDiscoverResponse({ candidates: [withAddressability] })
    expect(candidates[0]?.scoreFactors[0]?.block).toBe('activity')
  })

  it('drops an unknown block key rather than trusting it', () => {
    const { candidates } = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, scoreFactors: [{ label: 'x', points: 1, block: 'divers' }] }],
    })
    expect(candidates[0]?.scoreFactors[0]?.block).toBeUndefined()
  })

  it('omits addressability entirely when the payload has none (snapshot d’avant)', () => {
    const { candidates } = normalizeDiscoverResponse({ candidates: [rawCandidate] })
    expect(candidates[0]?.addressability).toBeUndefined()
  })

  it('keeps a null addressability score — « pas mesuré » n’est pas zéro', () => {
    const { candidates } = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          addressability: { score: null, max: 0, unmeasured: ['lock', 'proportion'], factors: [] },
        },
      ],
    })
    expect(candidates[0]?.addressability).toEqual({
      score: null,
      max: 0,
      unmeasured: ['lock', 'proportion'],
      factors: [],
    })
  })

  it('ignores an addressability that is not an object', () => {
    const { candidates } = normalizeDiscoverResponse({ candidates: [{ ...rawCandidate, addressability: 'oui' }] })
    expect(candidates[0]?.addressability).toBeUndefined()
  })

  it('drops an axis factor with no axis — a nameless axis explains nothing', () => {
    const { candidates } = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          addressability: {
            score: 6,
            max: 6,
            unmeasured: [],
            factors: [
              { label: 'sans axe', points: 6 },
              { label: 'avec axe', points: 0, axis: 'proportion' },
            ],
          },
        },
      ],
    })
    expect(candidates[0]?.addressability?.factors.map(f => f.axis)).toEqual(['proportion'])
  })
})

describe('normalizeDiscoverResponse — la barrière d’achat (tome 3)', () => {
  const withBarrier = {
    ...rawCandidate,
    barrier: {
      score: 5.6,
      accessibility: 4.4,
      access_class: 'C',
      label: 'Semi-ouvert',
      measurable: true,
      missing: ['cotation'],
      proxies: [
        { key: 'statut', contribution: 3.15, evidence: 'grande entreprise au sens INSEE', measurable: true },
        { key: 'cotation', contribution: 0, evidence: 'cotation inconnue', measurable: false },
      ],
      corrections: [
        { key: 'echeance_proche', delta: -1.5, label: 'Le marché arrive à échéance', evidence: 'jusqu’au 2026-11-01' },
      ],
    },
  }

  it('carries the barrier through — a field not copied never reaches the screen', () => {
    const { candidates } = normalizeDiscoverResponse({ candidates: [withBarrier] })
    expect(candidates[0]?.barrier).toMatchObject({ score: 5.6, access_class: 'C', label: 'Semi-ouvert' })
    expect(candidates[0]?.barrier?.proxies).toHaveLength(2)
    expect(candidates[0]?.barrier?.corrections?.[0]?.delta).toBe(-1.5)
  })

  it('keeps an unmeasurable barrier as such — never a class A by default', () => {
    const { candidates } = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          barrier: {
            score: null,
            accessibility: null,
            access_class: null,
            label: null,
            measurable: false,
            missing: ['statut', 'effectif'],
            proxies: [],
            corrections: [],
          },
        },
      ],
    })
    expect(candidates[0]?.barrier?.measurable).toBe(false)
    expect(candidates[0]?.barrier?.access_class).toBeNull()
    expect(candidates[0]?.barrier?.missing).toEqual(['statut', 'effectif'])
  })

  it('refuses an unknown class rather than trusting it', () => {
    const { candidates } = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, barrier: { ...withBarrier.barrier, access_class: 'Z' } }],
    })
    expect(candidates[0]?.barrier?.access_class).toBeNull()
  })

  it('omits the barrier entirely when the payload has none', () => {
    const { candidates } = normalizeDiscoverResponse({ candidates: [rawCandidate] })
    expect(candidates[0]?.barrier).toBeUndefined()
  })
})

/* --- Le normaliseur avale-t-il les champs neufs ? (troisième occurrence) --- */
describe('normalizeScoreFactor — label_key/label_params atteignent l’écran', () => {
  const withKey = (factor: Record<string, unknown>) =>
    normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, scoreFactors: [factor] }],
      query: { limit: 24 },
      degraded: [],
    }).candidates[0].scoreFactors[0]

  it('recopie label_key et label_params — sans quoi le correctif i18n meurt en chemin', () => {
    expect(
      withKey({
        label: 'NAF 62.02 exact',
        points: 25,
        evidence: '62.02A',
        label_key: 'factors.nafExact',
        label_params: { code: '62.02' },
      }),
    ).toMatchObject({ label_key: 'factors.nafExact', label_params: { code: '62.02' } })
  })

  it('sait dire NON : sans label_key, rien n’est inventé — c’est le repli qui rend la fenêtre de déploiement inoffensive', () => {
    const factor = withKey({ label: 'NAF 62.02 exact', points: 25 })
    expect(factor.label_key).toBeUndefined()
    expect(factor.label_params).toBeUndefined()
    expect(factor.label).toBe('NAF 62.02 exact')
  })

  it('n’attrape pas ce qu’il ne vise pas : un paramètre d’un type que le contrat interdit est ÉCARTÉ, pas affiché', () => {
    expect(
      withKey({
        label: 'Ville Lyon — zone demandée',
        points: 8,
        label_key: 'factors.cityRequested',
        label_params: { city: 'Lyon', bogus: { nested: true }, nan: Number.NaN },
      })?.label_params,
    ).toEqual({ city: 'Lyon' })
  })

  it('des paramètres sans clé ne voyagent pas seuls — ils n’auraient rien à interpoler', () => {
    expect(withKey({ label: 'Signaux datés (3)', points: 6, label_params: { n: 3 } })?.label_params).toBeUndefined()
  })
})

// #4068 (lot DECOUVRIR-CARTE) — une levée ou une actualité servie par la recherche atteint la carte.
describe('#4068 — normalizeDiscoverResponse garde les levées et les actualités', () => {
  it('rend un signal `funding` et un signal `business`, écarte un type inconnu', () => {
    const out = normalizeDiscoverResponse({
      candidates: [
        {
          siren: '552081317',
          name: 'ACME',
          signals: [
            { type: 'funding', label: 'Levée de fonds de 40 M€', date: '2026-10-01' },
            { type: 'business', label: 'Projet : nouvelle usine à Figeac', date: '2026-09-20' },
            { type: 'rumeur', label: 'On dit que…', date: '2026-09-20' },
          ],
        },
      ],
    })
    expect(out.candidates[0]?.signals.map(s => s.type)).toEqual(['funding', 'business'])
  })
})

describe('normalizeDiscoverResponse — listingFilter (#4361.2)', () => {
  it('recopie le compteur : retirées, cotation non établie, source disponible', () => {
    const res = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [],
      listingFilter: { applied: true, excludedCount: 2, unknownCount: 14, sourceAvailable: true },
    })
    expect(res.listingFilter).toEqual({ applied: true, excludedCount: 2, unknownCount: 14, sourceAvailable: true })
  })

  it('sait dire NON : sans interrupteur, pas de compteur (jamais « 0 retirée »)', () => {
    const res = normalizeDiscoverResponse({ candidates: [], query: {}, degraded: [] })
    expect('listingFilter' in res).toBe(false)
  })

  it('un compteur illisible reste absent, jamais inventé', () => {
    const res = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [],
      listingFilter: { excludedCount: 2 },
    })
    expect(res.listingFilter).toBeUndefined()
  })
})

describe('normalizeDiscoverResponse — une taille absente n’est jamais « 0 salarié » (#4436.3)', () => {
  it.each(['0 salarié', '0 salariés', '00', '0'])('« %s » devient une taille non publiée (null)', label => {
    const res = normalizeDiscoverResponse({
      candidates: [{ ...rawCandidate, headcountRange: label }],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.headcountRange).toBeNull()
  })

  it('NON : une vraie tranche est gardée telle quelle', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        { ...rawCandidate, headcountRange: '10 à 19 salariés' },
        { ...rawCandidate, siren: '552100555', headcountRange: '250 à 499 salariés' },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates.map(c => c.headcountRange)).toEqual(['10 à 19 salariés', '250 à 499 salariés'])
  })
})

describe('#4746.6 — normalizeDiscoverResponse garde le compteur du filtre « Clients finaux »', () => {
  const base = {
    candidatesFound: 5,
    resolutionsAttempted: 5,
    resolved: 5,
    rejectedAmbiguous: 0,
    rejectedUnreachable: 0,
    notExamined: 0,
    stoppedOn: 'complete',
    resolveOffset: 0,
    hasMore: false,
  }

  it('porte filteredByEntityType quand il est positif', () => {
    const out = normalizeDiscoverResponse({ candidates: [], coverage: { ...base, filteredByEntityType: 3 } })
    expect(out.coverage?.filteredByEntityType).toBe(3)
  })

  it('l’omet quand il est absent ou nul — jamais un « 0 » inventé', () => {
    expect(normalizeDiscoverResponse({ candidates: [], coverage: base }).coverage).not.toHaveProperty(
      'filteredByEntityType',
    )
    expect(
      normalizeDiscoverResponse({ candidates: [], coverage: { ...base, filteredByEntityType: 0 } }).coverage,
    ).not.toHaveProperty('filteredByEntityType')
  })
})

describe('lot T — le JSON de prod atteint l’écran (la normalisation reconstruit champ par champ)', () => {
  it('Decathlon : la tête garde ses membres, le membre garde le NOM de sa tête', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          name: 'DECATHLON',
          siren: '306138900',
          brandGroup: { role: 'head', members: [{ siren: '500569405', name: 'DECATHLON FRANCE' }] },
        },
        {
          ...rawCandidate,
          name: 'DECATHLON FRANCE',
          siren: '500569405',
          brandGroup: { role: 'member', headSiren: '306138900', headName: 'DECATHLON' },
        },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]?.brandGroup).toEqual({
      role: 'head',
      members: [{ siren: '500569405', name: 'DECATHLON FRANCE' }],
    })
    expect(res.candidates[1]?.brandGroup).toEqual({ role: 'member', headSiren: '306138900', headName: 'DECATHLON' })
  })

  it('EXTIA : actorKind et motif (esnRecognition) voyagent ; un motif inconnu est rejeté', () => {
    const res = normalizeDiscoverResponse({
      candidates: [
        {
          ...rawCandidate,
          name: 'EXTIA',
          siren: '499379923',
          nafCode: '71.12B',
          actorKind: 'esn',
          esnRecognition: 'referential',
        },
        { ...rawCandidate, siren: '552100555', actorKind: 'esn', esnRecognition: 'deviné' },
        { ...rawCandidate, siren: '552100556', esnRecognition: null },
      ],
      query: {},
      degraded: [],
    })
    expect(res.candidates[0]).toMatchObject({ actorKind: 'esn', esnRecognition: 'referential' })
    expect(res.candidates[1]?.esnRecognition).toBeUndefined()
    expect(res.candidates[2]?.esnRecognition).toBeUndefined()
  })
})

describe('lot 786 (#5203) — needsFilteredOut', () => {
  it('garde le nombre de cartes retirées par le filtre de besoins, jamais un zéro inventé', () => {
    expect(normalizeDiscoverResponse({ candidates: [], degraded: [], needsFilteredOut: 4 }).needsFilteredOut).toBe(4)
    expect('needsFilteredOut' in normalizeDiscoverResponse({ candidates: [], degraded: [], needsFilteredOut: 0 })).toBe(
      false,
    )
    expect('needsFilteredOut' in normalizeDiscoverResponse({ candidates: [], degraded: [] })).toBe(false)
  })
})
