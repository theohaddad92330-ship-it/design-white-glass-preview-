import { describe, expect, it } from 'vitest'
import {
  PLANNING_FILTER_KEYS,
  PLANNING_QUICK_CHIPS,
  countActiveFilters,
  emptyPlanningFilters,
  matchesPlanningFilters,
  matchesQuickChip,
  missionSituation,
  planningViewToSavedRecord,
  savedRecordToPlanningView,
  toggleValue,
  type PlanningMissionFacts,
} from './planning-views'

const TODAY = '2026-10-22'

function facts(over: Partial<PlanningMissionFacts> = {}): PlanningMissionFacts {
  return {
    startedOn: '2026-09-01',
    endsOn: '2026-12-30',
    renewalStatus: null,
    account: 'Thales',
    consultants: ['Inès Kaczmarek'],
    owner: 'Maëlle Lorquin',
    skills: ['Sécurité applicative'],
    clientTeams: [],
    businessUnit: null,
    availabilityBucket: 'later',
    ...over,
  }
}

// Théo missions-planning.R9 — quatre situations, jamais quatorze statuts.
describe('missionSituation', () => {
  it('une mission commencée dont la fin est lointaine est « En cours »', () => {
    expect(missionSituation(facts(), TODAY)).toBe('running')
  })
  it('un démarrage dans le futur est « Démarrage prévu »', () => {
    expect(missionSituation(facts({ startedOn: '2026-11-03' }), TODAY)).toBe('starting')
  })
  it('une fin sous 30 jours est « Fin proche »', () => {
    expect(missionSituation(facts({ endsOn: '2026-10-30' }), TODAY)).toBe('ending')
  })
  it('un renouvellement ouvert est « À renouveler », même si la fin approche', () => {
    expect(missionSituation(facts({ endsOn: '2026-11-13', renewalStatus: 'discussion_en_cours' }), TODAY)).toBe(
      'renewal',
    )
  })
  it('un renouvellement signé ne demande plus rien : la mission reste « En cours »', () => {
    expect(missionSituation(facts({ endsOn: '2026-11-13', renewalStatus: 'renouvele' }), TODAY)).toBe('running')
  })
  it('une fin absente ne se range jamais en « Fin proche »', () => {
    expect(missionSituation(facts({ endsOn: null }), TODAY)).toBe('running')
  })
})

describe('matchesQuickChip', () => {
  it('ending : la fin tombe dans les 30 jours', () => {
    expect(matchesQuickChip('ending', facts({ endsOn: '2026-10-30' }), TODAY, false)).toBe(true)
    expect(matchesQuickChip('ending', facts({ endsOn: '2026-12-30' }), TODAY, false)).toBe(false)
    expect(matchesQuickChip('ending', facts({ endsOn: null }), TODAY, false)).toBe(false)
  })
  it('starting : le démarrage est strictement dans le futur', () => {
    expect(matchesQuickChip('starting', facts({ startedOn: '2026-11-03' }), TODAY, false)).toBe(true)
    expect(matchesQuickChip('starting', facts({ startedOn: '2026-10-22' }), TODAY, false)).toBe(false)
    expect(matchesQuickChip('starting', facts({ startedOn: null }), TODAY, false)).toBe(false)
  })
  it('noEnd : aucune date de fin saisie', () => {
    expect(matchesQuickChip('noEnd', facts({ endsOn: null }), TODAY, false)).toBe(true)
    expect(matchesQuickChip('noEnd', facts(), TODAY, false)).toBe(false)
  })
  it('toCheck : lit le drapeau passé par l’appelant (conflit de planning)', () => {
    expect(matchesQuickChip('toCheck', facts(), TODAY, true)).toBe(true)
    expect(matchesQuickChip('toCheck', facts(), TODAY, false)).toBe(false)
  })
  it('expose les pastilles de la maquette, avec les fenêtres 60 j et 90 j (#4197.4)', () => {
    expect(PLANNING_QUICK_CHIPS).toEqual(['ending', 'ending60', 'ending90', 'starting', 'noEnd', 'toCheck'])
  })
})

// Décision de Louis : multi-sélection partout, un critère n’apparaît qu’une fois.
describe('matchesPlanningFilters', () => {
  it('sans filtre, tout passe', () => {
    expect(matchesPlanningFilters(facts(), emptyPlanningFilters(), TODAY)).toBe(true)
  })
  it('plusieurs valeurs d’un même critère sont un OU', () => {
    const filters = { ...emptyPlanningFilters(), account: ['SNCF', 'Thales'] }
    expect(matchesPlanningFilters(facts({ account: 'Thales' }), filters, TODAY)).toBe(true)
    expect(matchesPlanningFilters(facts({ account: 'Orange' }), filters, TODAY)).toBe(false)
  })
  it('des critères différents sont un ET', () => {
    const filters = { ...emptyPlanningFilters(), account: ['Thales'], owner: ['Autre'] }
    expect(matchesPlanningFilters(facts(), filters, TODAY)).toBe(false)
  })
  it('consultant : une seule personne affectée suffit', () => {
    const filters = { ...emptyPlanningFilters(), consultant: ['Hakim Barreau'] }
    expect(matchesPlanningFilters(facts({ consultants: ['Inès Kaczmarek', 'Hakim Barreau'] }), filters, TODAY)).toBe(
      true,
    )
    expect(matchesPlanningFilters(facts({ consultants: [] }), filters, TODAY)).toBe(false)
  })
  it('statut : se lit sur la situation dérivée, pas sur le statut brut', () => {
    const filters = { ...emptyPlanningFilters(), situation: ['ending'] }
    expect(matchesPlanningFilters(facts({ endsOn: '2026-10-30' }), filters, TODAY)).toBe(true)
    expect(matchesPlanningFilters(facts(), filters, TODAY)).toBe(false)
  })
  it('expertise et équipe client : une compétence ou une équipe portée suffit', () => {
    const filters = { ...emptyPlanningFilters(), skill: ['Kubernetes'], clientTeam: ['DSI Orange Business'] }
    expect(
      matchesPlanningFilters(facts({ skills: ['Kubernetes'], clientTeams: ['DSI Orange Business'] }), filters, TODAY),
    ).toBe(true)
    expect(
      matchesPlanningFilters(facts({ skills: ['Data'], clientTeams: ['DSI Orange Business'] }), filters, TODAY),
    ).toBe(false)
  })
  it('une valeur absente ne passe jamais un filtre qui la demande', () => {
    const filters = { ...emptyPlanningFilters(), owner: ['Maëlle Lorquin'] }
    expect(matchesPlanningFilters(facts({ owner: null }), filters, TODAY)).toBe(false)
  })
  it('disponibilité dérivée : lit la case calculée par l’appelant', () => {
    const filters = { ...emptyPlanningFilters(), availability: ['soon', 'now'] }
    expect(matchesPlanningFilters(facts({ availabilityBucket: 'soon' }), filters, TODAY)).toBe(true)
    expect(matchesPlanningFilters(facts({ availabilityBucket: 'later' }), filters, TODAY)).toBe(false)
  })
})

describe('countActiveFilters / toggleValue', () => {
  it('compte les critères actifs, pas les valeurs', () => {
    const filters = { ...emptyPlanningFilters(), account: ['A', 'B'], owner: ['C'] }
    expect(countActiveFilters(filters)).toBe(2)
    expect(countActiveFilters(emptyPlanningFilters())).toBe(0)
  })
  it('toggleValue ajoute puis retire', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b'])
  })
  it('déclare les huit critères, les plus pertinents d’abord', () => {
    expect(PLANNING_FILTER_KEYS).toEqual([
      'account',
      'consultant',
      'owner',
      'situation',
      'skill',
      'clientTeam',
      'availability',
      'businessUnit',
    ])
  })
})

// Mes vues : on enregistre les filtres ET la fenêtre de dates.
describe('vues enregistrées du planning', () => {
  it('fait l’aller-retour des filtres, des pastilles et de la fenêtre', () => {
    const view = {
      filters: { ...emptyPlanningFilters(), account: ['SNCF'], situation: ['ending', 'renewal'] },
      chips: ['ending' as const],
      anchor: '2026-09',
      scale: 6 as const,
      groupBy: 'consultant' as const,
      withFinished: true,
    }
    expect(savedRecordToPlanningView(planningViewToSavedRecord(view))).toEqual(view)
  })
  it('relit une valeur abîmée comme « pas de critère », sans exception', () => {
    const back = savedRecordToPlanningView({
      planning: { filters: { account: 'pas-un-tableau', zzz: ['x'] }, chips: ['inconnue'], anchor: 12, scale: 9 },
    })
    expect(back).toEqual({
      filters: emptyPlanningFilters(),
      chips: [],
      anchor: null,
      scale: 4,
      groupBy: 'mission',
      withFinished: false,
    })
  })
  it('un enregistrement sans clé « planning » n’est pas une vue du planning', () => {
    expect(savedRecordToPlanningView({ query: 'x' })).toBeNull()
  })
})

// #4197.4 — les fenêtres 60 j et 90 j sont CUMULATIVES, comme `missions_ending_60/90` du serveur.
describe('matchesQuickChip — fenêtres de fin 30 / 60 / 90 j', () => {
  it('une fin à 47 j est sous 60 j et sous 90 j, pas sous 30 j ; une fin absente n’est jamais « bientôt »', () => {
    const f = { startedOn: '2026-09-01', endsOn: '2026-12-08' }
    expect(matchesQuickChip('ending', f, TODAY, false)).toBe(false)
    expect(matchesQuickChip('ending60', f, TODAY, false)).toBe(true)
    expect(matchesQuickChip('ending90', f, TODAY, false)).toBe(true)
    const none = { startedOn: '2026-09-01', endsOn: null }
    for (const chip of ['ending', 'ending60', 'ending90'] as const)
      expect(matchesQuickChip(chip, none, TODAY, false)).toBe(false)
  })
  it('les puces sont déclarées dans l’ordre 30 / 60 / 90', () => {
    expect(PLANNING_QUICK_CHIPS.slice(0, 3)).toEqual(['ending', 'ending60', 'ending90'])
  })
})
