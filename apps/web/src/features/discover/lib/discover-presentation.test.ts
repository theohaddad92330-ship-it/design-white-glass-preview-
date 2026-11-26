import {
  applyCandidateFilters,
  hasDirectSignal,
  hasRoleFamily,
  hasSignalOfNature,
  hiddenCandidatesBreakdown,
  isExcludedByQualification,
  isOwnedByRep,
  isWorkedByRep,
  notSearchedAxes,
  portfolioBadgeFor,
  reconcileExcludedCount,
  signalAgeDays,
  signalTypeLabelKey,
} from './discover-presentation'
import type { DiscoverCandidate } from './discover-types'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 50,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

/* ------------------------------------------------------------------ */
/*  Badge état portefeuille                                            */
/* ------------------------------------------------------------------ */

describe('portfolioBadgeFor', () => {
  it('renders no badge for a brand-new candidate', () => {
    expect(portfolioBadgeFor(candidate({ portfolioState: 'new' }))).toBeNull()
  })

  it.each([
    ['analyzed', 'portfolio.analyzed'],
    ['watched', 'portfolio.watched'],
    ['customer', 'portfolio.customer'],
  ] as const)('exposes the %s badge with its i18n key', (state, key) => {
    const badge = portfolioBadgeFor(candidate({ portfolioState: state }))
    expect(badge?.labelKey).toBe(key)
    expect(badge?.tone).toBeTruthy()
  })

  it('links to the existing account when the API resolved one', () => {
    const badge = portfolioBadgeFor(candidate({ portfolioState: 'analyzed', accountId: 'acc-1' }))
    expect(badge?.accountId).toBe('acc-1')
  })

  it('exposes no link when the state is known but no account id came back', () => {
    expect(portfolioBadgeFor(candidate({ portfolioState: 'customer' }))?.accountId).toBeNull()
  })

  it('shows the locally-followed candidate as watched even when the API still says new', () => {
    const badge = portfolioBadgeFor(candidate({ portfolioState: 'new' }), { locallyWatched: true })
    expect(badge?.labelKey).toBe('portfolio.watched')
  })

  it('never downgrades a server state to the local one', () => {
    const badge = portfolioBadgeFor(candidate({ portfolioState: 'customer' }), { locallyWatched: true })
    expect(badge?.labelKey).toBe('portfolio.customer')
  })
})

/* ------------------------------------------------------------------ */
/*  « Masquer ce que je possède déjà »                                 */
/* ------------------------------------------------------------------ */

describe('isOwnedByRep', () => {
  it('counts analyzed, watched and customer as owned', () => {
    expect(isOwnedByRep(candidate({ portfolioState: 'analyzed' }))).toBe(true)
    expect(isOwnedByRep(candidate({ portfolioState: 'watched' }))).toBe(true)
    expect(isOwnedByRep(candidate({ portfolioState: 'customer' }))).toBe(true)
  })

  it('does not count a new candidate as owned', () => {
    expect(isOwnedByRep(candidate({ portfolioState: 'new' }))).toBe(false)
  })
})

// #2165.26 — « Déjà travaillé » se filtre SÉPARÉMENT de « déjà à moi »
// (hideOwned, qui masque aussi watched/parked). `isWorkedByRep` ne vise que
// les deux états que le retour nomme : client ou déjà analysé.
describe('isWorkedByRep', () => {
  it('counts customer and analyzed as already worked', () => {
    expect(isWorkedByRep(candidate({ portfolioState: 'customer' }))).toBe(true)
    expect(isWorkedByRep(candidate({ portfolioState: 'analyzed' }))).toBe(true)
  })

  it('does not count watched or parked as already worked — un simple suivi n’est pas un travail fait', () => {
    expect(isWorkedByRep(candidate({ portfolioState: 'watched' }))).toBe(false)
    expect(isWorkedByRep(candidate({ portfolioState: 'parked' }))).toBe(false)
  })

  it('does not count a new candidate', () => {
    expect(isWorkedByRep(candidate({ portfolioState: 'new' }))).toBe(false)
  })
})

// #2614.1 — le conseil de qualification (`account_qualification.py`) a déjà
// tranché : une ligne EXCLUE n'est vendable à personne. Même prédicat que
// `discover-call-list.ts` (GA-26, un seul endroit) — pas un second calcul.
describe('isExcludedByQualification', () => {
  it('est vrai pour un verdict EXCLU', () => {
    expect(
      isExcludedByQualification(
        candidate({ qualification: { verdict: 'excluded', code: 'natural_person', reason: 'x', otherCodes: [] } }),
      ),
    ).toBe(true)
  })

  it.each(['recommended', 'to_verify'] as const)('est faux pour un verdict « %s »', verdict => {
    expect(
      isExcludedByQualification(candidate({ qualification: { verdict, code: null, reason: 'x', otherCodes: [] } })),
    ).toBe(false)
  })

  it('est faux quand aucun verdict n’a encore été rendu (réponse d’avant #2165)', () => {
    expect(isExcludedByQualification(candidate({ qualification: undefined }))).toBe(false)
  })
})

describe('applyCandidateFilters', () => {
  const list = [
    candidate({ siren: '111111111', portfolioState: 'new' }),
    candidate({ siren: '222222222', portfolioState: 'customer' }),
    candidate({ siren: '333333333', portfolioState: 'new' }),
  ]

  it('returns everything when no filter is active', () => {
    expect(applyCandidateFilters(list, { hideOwned: false, dismissed: new Set() })).toHaveLength(3)
  })

  it('hides what the rep already owns when asked', () => {
    const out = applyCandidateFilters(list, { hideOwned: true, dismissed: new Set() })
    expect(out.map(c => c.siren)).toEqual(['111111111', '333333333'])
  })

  it('always hides dismissed candidates — « Écarter » se souvient', () => {
    const out = applyCandidateFilters(list, { hideOwned: false, dismissed: new Set(['333333333']) })
    expect(out.map(c => c.siren)).toEqual(['111111111', '222222222'])
  })

  it('combines both filters', () => {
    const out = applyCandidateFilters(list, { hideOwned: true, dismissed: new Set(['111111111']) })
    expect(out.map(c => c.siren)).toEqual(['333333333'])
  })

  it('does not mutate the source list', () => {
    applyCandidateFilters(list, { hideOwned: true, dismissed: new Set(['111111111']) })
    expect(list).toHaveLength(3)
  })

  // #2165.26 — masque customer/analyzed sans toucher aux autres, INDÉPENDAMMENT
  // de hideOwned (deux réglages distincts, pas un raccourci de l'autre).
  it('hides customer/analyzed when hideWorked is on, even with hideOwned off', () => {
    const withWatched = [...list, candidate({ siren: '444444444', portfolioState: 'watched' })]
    const out = applyCandidateFilters(withWatched, { hideOwned: false, hideWorked: true, dismissed: new Set() })
    expect(out.map(c => c.siren)).toEqual(['111111111', '333333333', '444444444'])
  })

  it('defaults hideWorked to off when the caller does not pass it — no existing call site breaks', () => {
    expect(applyCandidateFilters(list, { hideOwned: false, dismissed: new Set() })).toHaveLength(3)
  })

  // #2614.1 — jamais un réglage : une ligne écartée par le conseil de
  // qualification est masquée d'office, aucun toggle ne la ramène.
  it('masks a qualification-excluded candidate unconditionally, no flag needed', () => {
    const withExcluded = [
      ...list,
      candidate({
        siren: '555555555',
        portfolioState: 'new',
        qualification: { verdict: 'excluded', code: 'natural_person', reason: 'x', otherCodes: [] },
      }),
    ]
    const out = applyCandidateFilters(withExcluded, { hideOwned: false, dismissed: new Set() })
    expect(out.map(c => c.siren)).toEqual(['111111111', '222222222', '333333333'])
  })
})

/* ------------------------------------------------------------------ */
/*  Manque C du 30/08 — « N masquées » sans motif                       */
/* ------------------------------------------------------------------ */

/**
 * `hiddenCount` (Discover.tsx) conflait deux motifs disjoints dans un seul
 * total : « déjà à toi » (`hideOwned`) et « écarté » (`dismissed`). Les deux
 * sont déjà CONNUS côté écran — aucun n'est inventé, contrairement aux motifs
 * d'écart côté serveur (`coverage.rejectedAmbiguous`…) qui restent hors
 * périmètre de ce fichier.
 */
describe('hiddenCandidatesBreakdown — un total masqué se répartit PAR MOTIF', () => {
  const list = [
    candidate({ siren: '111111111', portfolioState: 'new' }),
    candidate({ siren: '222222222', portfolioState: 'customer' }),
    candidate({ siren: '333333333', portfolioState: 'new' }),
    candidate({ siren: '444444444', portfolioState: 'watched' }),
  ]

  it('rend zéro des motifs quand rien n’est masqué', () => {
    expect(hiddenCandidatesBreakdown(list, { hideOwned: false, dismissed: new Set() })).toEqual({
      excluded: 0,
      owned: 0,
      worked: 0,
      dismissed: 0,
    })
  })

  it('compte « déjà à toi » quand hideOwned est actif', () => {
    const out = hiddenCandidatesBreakdown(list, { hideOwned: true, dismissed: new Set() })
    expect(out).toEqual({ excluded: 0, owned: 2, worked: 0, dismissed: 0 })
  })

  it('compte « écarté » indépendamment de hideOwned', () => {
    const out = hiddenCandidatesBreakdown(list, { hideOwned: false, dismissed: new Set(['333333333']) })
    expect(out).toEqual({ excluded: 0, owned: 0, worked: 0, dismissed: 1 })
  })

  it('un candidat écarté ET déjà possédé compte une seule fois — sous « écarté », jamais les deux', () => {
    // « Écarter » est un geste explicite plus fort que « déjà à moi » : le
    // filtre applyCandidateFilters teste `dismissed` EN PREMIER.
    const out = hiddenCandidatesBreakdown(list, { hideOwned: true, dismissed: new Set(['222222222']) })
    expect(out).toEqual({ excluded: 0, owned: 1, worked: 0, dismissed: 1 })
  })

  it('la somme égale EXACTEMENT ce que applyCandidateFilters retire — aucun motif ne se devine, aucun ne se perd', () => {
    for (const filters of [
      { hideOwned: false, dismissed: new Set<string>() },
      { hideOwned: true, dismissed: new Set<string>() },
      { hideOwned: false, dismissed: new Set(['111111111', '444444444']) },
      { hideOwned: true, dismissed: new Set(['222222222']) },
    ]) {
      const removed = list.length - applyCandidateFilters(list, filters).length
      const breakdown = hiddenCandidatesBreakdown(list, filters)
      expect(breakdown.excluded + breakdown.owned + breakdown.dismissed).toBe(removed)
    }
  })

  it('ne mute pas la liste source', () => {
    hiddenCandidatesBreakdown(list, { hideOwned: true, dismissed: new Set(['111111111']) })
    expect(list).toHaveLength(4)
  })

  // #2165.26 — le motif « déjà travaillé » compte à part, jamais fondu dans
  // « déjà à toi » : les deux réglages sont indépendants.
  it('compte « déjà travaillé » à part de « déjà à toi »', () => {
    const out = hiddenCandidatesBreakdown(list, { hideOwned: false, hideWorked: true, dismissed: new Set() })
    expect(out).toEqual({ excluded: 0, owned: 0, worked: 1, dismissed: 0 })
  })

  it('worked par défaut à 0 quand hideWorked est omis — repli sûr', () => {
    expect(hiddenCandidatesBreakdown(list, { hideOwned: false, dismissed: new Set() }).worked).toBe(0)
  })

  // #2614.1 — masquer un verdict EXCLU sans dire combien serait la même
  // faute dans l'autre sens (« non mesuré » n'est jamais « 0 ») : le
  // compteur NOMME ce qu'il masque.
  describe('le motif « exclu par le conseil de qualification » (#2614.1)', () => {
    const withExcluded = [
      ...list,
      candidate({
        siren: '666666666',
        portfolioState: 'new',
        qualification: { verdict: 'excluded', code: 'natural_person', reason: 'x', otherCodes: [] },
      }),
    ]

    it('compte un candidat exclu à part, même sans aucun réglage utilisateur actif', () => {
      const out = hiddenCandidatesBreakdown(withExcluded, { hideOwned: false, dismissed: new Set() })
      expect(out).toEqual({ excluded: 1, owned: 0, worked: 0, dismissed: 0 })
    })

    it('un candidat exclu ET déjà possédé compte une seule fois — sous « exclu », jamais les deux', () => {
      const excludedAndOwned = [
        ...list,
        candidate({
          siren: '777777777',
          portfolioState: 'customer',
          qualification: { verdict: 'excluded', code: 'ceased', reason: 'x', otherCodes: [] },
        }),
      ]
      const out = hiddenCandidatesBreakdown(excludedAndOwned, { hideOwned: true, dismissed: new Set() })
      expect(out.excluded).toBe(1)
    })

    it('la somme inclut désormais « exclu »', () => {
      const filters = { hideOwned: true, dismissed: new Set<string>() }
      const removed = withExcluded.length - applyCandidateFilters(withExcluded, filters).length
      const breakdown = hiddenCandidatesBreakdown(withExcluded, filters)
      expect(breakdown.excluded + breakdown.owned + breakdown.worked + breakdown.dismissed).toBe(removed)
    })
  })

  /**
   * #2614.1 (correction) — réfuté en recette écran le 21/09/2026 : le tri
   * côté IA place les verdicts EXCLU en dernier (`_VERDICT_RANK`,
   * `apps/ia/app/routers/discover.py`), et `candidates[:limit]` les retire
   * donc TOUS dès qu'une recherche trouve plus de comptes que `limit` — le
   * compte local (ci-dessus), qui ne voit que ce qui a survécu à la coupe,
   * retombait alors à zéro. `query.qualificationExcludedTotal` porte le
   * total RÉEL, mesuré côté IA avant la coupe : il ne peut être qu'ÉGAL OU
   * SUPÉRIEUR à ce que la liste reçue laisse compter, jamais l'inverse.
   */
  describe('reconcileExcludedCount — #2614.1 (correction)', () => {
    it('garde le compte local quand `query` ne porte pas de total', () => {
      expect(reconcileExcludedCount(0, undefined)).toBe(0)
      expect(reconcileExcludedCount(1, {})).toBe(1)
    })

    it('préfère le total IA quand il DÉPASSE ce que la coupe a laissé compter', () => {
      expect(reconcileExcludedCount(0, { qualificationExcludedTotal: 2 })).toBe(2)
    })

    it('ne redescend jamais sous le compte local (jamais une exclusion oubliée)', () => {
      expect(reconcileExcludedCount(3, { qualificationExcludedTotal: 1 })).toBe(3)
    })

    it('ignore une valeur mal formée — jamais une exclusion inventée', () => {
      expect(reconcileExcludedCount(1, { qualificationExcludedTotal: 'deux' })).toBe(1)
      expect(reconcileExcludedCount(1, { qualificationExcludedTotal: -5 })).toBe(1)
    })
  })
})

/* ------------------------------------------------------------------ */
/*  Âge d'un signal — « AO publié il y a 12 j »                        */
/* ------------------------------------------------------------------ */

describe('signalAgeDays', () => {
  const now = Date.parse('2026-07-19T12:00:00Z')

  it('counts whole days since the signal date', () => {
    expect(signalAgeDays('2026-07-07', now)).toBe(12)
  })

  it('reads a full ISO timestamp too', () => {
    expect(signalAgeDays('2026-07-18T09:00:00Z', now)).toBe(1)
  })

  it('returns 0 for today rather than a negative or a fraction', () => {
    expect(signalAgeDays('2026-07-19T08:00:00Z', now)).toBe(0)
  })

  it('clamps a future date to 0 instead of showing "il y a -3 j"', () => {
    expect(signalAgeDays('2026-08-01', now)).toBe(0)
  })

  it('returns null for an unparseable date so the UI can hide the age', () => {
    expect(signalAgeDays('bientôt', now)).toBeNull()
    expect(signalAgeDays('', now)).toBeNull()
  })
})

describe('signalTypeLabelKey — la famille s’écrit, elle ne se colore pas (§26.1)', () => {
  it('rend une clé i18n par type du contrat, et jamais une teinte', () => {
    const types = ['award', 'hiring', 'legal', 'tech', 'tender'] as const
    expect(types.map(signalTypeLabelKey)).toEqual([
      'signalTypes.award',
      'signalTypes.hiring',
      'signalTypes.legal',
      'signalTypes.tech',
      'signalTypes.tender',
    ])
  })
})

/* ------------------------------------------------------------------ */
/*  #2165.45 — Filtre besoins : Nature                                 */
/* ------------------------------------------------------------------ */

// `legal`/`tech` sont RENDUS (`discoverSignalTypeSchema`) mais jamais
// interrogeables (`discoverSignalSourceSchema` n'en porte que trois) : ce
// filtre croise donc TOUJOURS à l'écran, sur les signaux déjà reçus, jamais
// dans la requête.
describe('hasSignalOfNature', () => {
  it('« any » ne contraint rien', () => {
    expect(hasSignalOfNature(candidate({ signals: [] }), 'any')).toBe(true)
  })

  it('garde un candidat qui porte au moins un signal de la nature demandée', () => {
    const c = candidate({
      signals: [
        { type: 'legal', label: 'Procédure', date: '2026-07-01' },
        { type: 'tender', label: 'AO', date: '2026-07-02' },
      ],
    })
    expect(hasSignalOfNature(c, 'legal')).toBe(true)
    expect(hasSignalOfNature(c, 'tech')).toBe(false)
  })

  it('écarte un candidat sans aucun signal de cette nature', () => {
    const c = candidate({ signals: [{ type: 'hiring', label: 'Recrute', date: '2026-07-01' }] })
    expect(hasSignalOfNature(c, 'legal')).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  #2165.46 — Filtre besoins : Niveau de preuve                       */
/* ------------------------------------------------------------------ */

// `intermediated` distingue « offre publiée par un cabinet POUR UN CLIENT » (le
// signal ne prouve rien du besoin de l'employeur NOMMÉ) d'une preuve directe.
describe('hasDirectSignal', () => {
  it('directOnly=false ne contraint rien', () => {
    expect(hasDirectSignal(candidate({ signals: [] }), false)).toBe(true)
  })

  it('garde un candidat avec au moins un signal NON intermédié', () => {
    const c = candidate({
      signals: [
        { type: 'hiring', label: 'via cabinet', date: '2026-07-01', intermediated: true },
        { type: 'tender', label: 'AO direct', date: '2026-07-02' },
      ],
    })
    expect(hasDirectSignal(c, true)).toBe(true)
  })

  it('un signal dont `intermediated` est ABSENT n’est jamais affirmé intermédié — il compte comme direct', () => {
    const c = candidate({ signals: [{ type: 'hiring', label: 'recrute', date: '2026-07-01' }] })
    expect(hasDirectSignal(c, true)).toBe(true)
  })

  it('écarte un candidat dont TOUS les signaux sont intermédiés', () => {
    const c = candidate({
      signals: [{ type: 'hiring', label: 'via cabinet', date: '2026-07-01', intermediated: true }],
    })
    expect(hasDirectSignal(c, true)).toBe(false)
  })

  it('un candidat sans aucun signal n’a rien à prouver — il n’est pas écarté', () => {
    expect(hasDirectSignal(candidate({ signals: [] }), true)).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  #2165.29 — Filtre comptes : Familles de rôles                      */
/* ------------------------------------------------------------------ */

// `suggestedRoles` est une SORTIE (LLM), déjà rendue sur la carte — jamais
// interrogeable au registre ni aux sources de signal. Le filtre croise donc
// TOUJOURS ici, en résolvant chaque département SUGGÉRÉ vers le VRAI registre
// des familles acheteurs (`resolveBuyerRoleFamily`), pas une taxonomie
// inventée pour l'occasion.
describe('hasRoleFamily', () => {
  it('« any » ne contraint rien', () => {
    expect(hasRoleFamily(candidate({ suggestedRoles: [] }), 'any')).toBe(true)
  })

  it('garde un candidat dont un rôle suggéré résout vers la famille demandée', () => {
    const c = candidate({ suggestedRoles: [{ title: 'DSI', department: 'DSI' }] })
    expect(hasRoleFamily(c, 'it')).toBe(true)
  })

  it('écarte un candidat dont aucun rôle ne résout vers cette famille', () => {
    const c = candidate({ suggestedRoles: [{ title: 'DRH', department: 'RH' }] })
    expect(hasRoleFamily(c, 'it')).toBe(false)
  })

  it('un département qui ne désigne AUCUNE des onze familles ne fait pas planter — il écarte, sans deviner', () => {
    const c = candidate({ suggestedRoles: [{ title: 'Mystère', department: 'Métier' }] })
    expect(hasRoleFamily(c, 'it')).toBe(false)
  })
})

/**
 * #3819.1 — « Ce qui n'a pas été cherché tient en UNE mention compacte »,
 * jamais une ligne vide par champ : un axe non cherché est NOMMÉ, un axe
 * cherché (trouvé ou non) ou sans objet n'apparaît pas ici.
 */
describe('notSearchedAxes', () => {
  it('ne nomme rien pour un candidat neuf dont les signaux ont été cherchés', () => {
    expect(notSearchedAxes(candidate({ signals: [], signalsSearched: true }))).toEqual([])
  })

  it('nomme les offres quand les signaux n’ont jamais été cherchés', () => {
    expect(notSearchedAxes(candidate({ signals: [], signalsSearched: undefined }))).toEqual(['offers'])
  })

  it('ne nomme pas les offres quand des signaux sont déjà présents — ils ont forcément été cherchés', () => {
    const c = candidate({ signals: [{ type: 'hiring', label: 'Recrute', date: '2026-01-01' }] })
    expect(notSearchedAxes(c)).toEqual([])
  })

  it('ne nomme jamais les besoins pour un candidat neuf — rien à chercher sans compte', () => {
    expect(notSearchedAxes(candidate({ accountId: null, signalsSearched: true }))).toEqual([])
  })

  it('ne nomme pas les besoins pour un compte possédé dont le décompte a réussi (0 inclus)', () => {
    expect(notSearchedAxes(candidate({ accountId: 'acc-1', signalsSearched: true, knownNeedsCount: 0 }))).toEqual([])
  })

  it('nomme les besoins pour un compte possédé dont le décompte a échoué — non cherché, jamais 0 deviné', () => {
    const c = candidate({ accountId: 'acc-1', signalsSearched: true, knownNeedsCount: undefined })
    expect(notSearchedAxes(c)).toEqual(['needs'])
  })

  it('cumule les deux axes quand ni les signaux ni les besoins n’ont pu être cherchés', () => {
    const c = candidate({ accountId: 'acc-1', signals: [], signalsSearched: undefined, knownNeedsCount: undefined })
    expect(notSearchedAxes(c)).toEqual(['offers', 'needs'])
  })
})
