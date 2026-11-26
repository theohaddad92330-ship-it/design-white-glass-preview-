import { describe, expect, it } from 'vitest'
import {
  detectRitualEffectiveness,
  nextRitualDate,
  RITUAL_CATALOG,
  RITUAL_KEYS,
  RITUAL_OWNERS,
  ritualLastHeldSchema,
  ritualPreferenceSchema,
  ritualProblems,
  ritualSchema,
  setRitualPreferenceSchema,
  ritualActionsCreatedSchema,
} from './ritual.js'
import { HYGIENE_CHECKS } from './data-hygiene.js'

/**
 * BEL-SC-242 (#3271.8) — « chaque rituel possède : participants, durée,
 * objets, décisions attendues, actions créées, owner, date suivante. » Durée
 * (`minutes`) et objets (`agenda`) existaient déjà ; ces gardes tiennent les
 * deux qui manquaient : `participants` et `expectedDecisions`.
 *
 * ⚠️ 29/09/2026 (#3298, suite #3271.8) — « date suivante » EST maintenant
 * livrée : `nextRitualDate` la DÉRIVE de la cadence du catalogue et d'une
 * marque de dernière tenue POSÉE ailleurs (`ritualLastHeldSchema`), jamais
 * inventée. « Actions créées » reste HORS de cette tranche : elle
 * supposerait un journal PAR rituel, exactement le troisième journal que ce
 * catalogue refuse (§ en tête de `ritual.ts`).
 */
describe('#3271.8 — participants et décisions attendues', () => {
  it('chaque rituel nomme AU MOINS un participant, toujours un RÔLE (jamais une personne)', () => {
    const missing = RITUAL_CATALOG.filter(
      ritual => ritual.participants.length === 0 || ritual.participants.some(role => !RITUAL_OWNERS.includes(role)),
    ).map(ritual => ritual.key)
    expect(missing).toEqual([])
  })

  it('les participants d’un rituel couvrent au moins les owners réellement portés par son ordre du jour', () => {
    // Un participant absent du rituel mais présent sur un point de son ordre
    // du jour serait une contradiction : « qui porte ce point » sans « qui est
    // dans la salle ».
    const inconsistent = RITUAL_CATALOG.filter(ritual => {
      const agendaOwners = new Set(ritual.agenda.map(item => item.owner))
      return [...agendaOwners].some(owner => !ritual.participants.includes(owner))
    }).map(ritual => ritual.key)
    expect(inconsistent).toEqual([])
  })

  it('chaque rituel nomme le GENRE de décision qu’il produit, en FR et en EN', () => {
    for (const ritual of RITUAL_CATALOG) {
      expect(ritual.expectedDecisions.fr.trim().length, ritual.key).toBeGreaterThan(0)
      expect(ritual.expectedDecisions.en.trim().length, ritual.key).toBeGreaterThan(0)
    }
  })
})

/** #3271.10/.12 — une DÉSACTIVATION, jamais une clé libre : `ritualKey` doit
 *  être une des cinq clés RÉELLES du catalogue, sinon la préférence pointe
 *  sur un rituel qui n'existe pas. */
describe('ritualPreferenceSchema / setRitualPreferenceSchema', () => {
  it('accepte une préférence bien formée, pour une clé réelle', () => {
    for (const key of RITUAL_KEYS) {
      expect(ritualPreferenceSchema.safeParse({ ritualKey: key, disabled: true }).success).toBe(true)
    }
  })

  it('refuse une clé de rituel qui n’existe pas', () => {
    expect(ritualPreferenceSchema.safeParse({ ritualKey: 'yearly', disabled: true }).success).toBe(false)
  })

  it('la saisie ne porte QUE le geste — un booléen, rien à réconcilier', () => {
    expect(setRitualPreferenceSchema.safeParse({ disabled: true }).success).toBe(true)
    expect(setRitualPreferenceSchema.safeParse({}).success).toBe(false)
  })
})

describe('RITUAL_CATALOG', () => {
  it('porte les cinq rituels du document', () => {
    expect(RITUAL_CATALOG.map(ritual => ritual.key).sort()).toEqual([...RITUAL_KEYS].sort())
  })

  it('chaque rituel valide son contrat', () => {
    for (const ritual of RITUAL_CATALOG) {
      const parsed = ritualSchema.safeParse(ritual)
      if (!parsed.success) throw new Error(`${ritual.key}: ${parsed.error.issues.map(i => i.message).join(', ')}`)
    }
  })

  it('aucun ordre du jour ne déborde de la durée annoncée', () => {
    // Une réunion dont les points dépassent l'horaire n'est pas une réunion de
    // 90 minutes : c'est une réunion qui déborde toujours, et l'équipe apprend
    // en trois semaines à ne plus croire l'heure de fin.
    const broken = RITUAL_CATALOG.filter(ritual => ritualProblems(ritual).length > 0).map(ritual => ({
      key: ritual.key,
      problems: ritualProblems(ritual),
    }))
    expect(broken).toEqual([])
  })

  it('les chiffres à ouvrir existent tous dans la vue Qualité', () => {
    // Un ordre du jour qui renvoie à un indicateur inexistant produit un point
    // de réunion vide — et c'est le point qu'on saute.
    const unknown = RITUAL_CATALOG.flatMap(ritual =>
      ritual.agenda.flatMap(item => item.watch.filter(check => !HYGIENE_CHECKS.includes(check))),
    )
    expect(unknown).toEqual([])
  })

  it('un point SANS chiffre reste légitime', () => {
    // « Blocages », « arbitrages » : ce sont des conversations. Y forcer un
    // indicateur ferait parler du chiffre plutôt que du blocage.
    const conversational = RITUAL_CATALOG.flatMap(ritual => ritual.agenda).filter(item => item.watch.length === 0)
    expect(conversational.length).toBeGreaterThan(0)
  })

  it('#2405.9 — chaque point d’ordre du jour porte un owner (rôle, jamais une personne)', () => {
    const missing = RITUAL_CATALOG.flatMap(ritual => ritual.agenda)
      .filter(item => !RITUAL_OWNERS.includes(item.owner))
      .map(item => item.label.fr)
    expect(missing).toEqual([])
  })

  it('#2405.9 — le rituel hebdomadaire couvre aussi prévisionnel et adoption', () => {
    const weekly = RITUAL_CATALOG.find(ritual => ritual.key === 'weekly')
    expect(weekly?.agenda.some(item => item.label.en.toLowerCase().includes('forecast'))).toBe(true)
    expect(weekly?.agenda.some(item => item.label.en.toLowerCase().includes('adoption'))).toBe(true)
  })

  it('ritualProblems attrape un ordre du jour trop long', () => {
    // La garde doit tomber quand elle doit tomber : sans ce test, une erreur de
    // lecture la rendrait inoffensive.
    const problems = ritualProblems({
      key: 'daily',
      label: { fr: 'x', en: 'x' },
      cadence: 'daily',
      minutes: 10,
      agenda: [{ position: 1, label: { fr: 'a', en: 'a' }, minutes: 60, watch: [], link: null }],
    })
    expect(problems).toHaveLength(1)
  })
})

describe('#3271.11 (suite #3298) — détecter un rituel répété sans effet mesurable', () => {
  const monthlyRitual = {
    key: 'monthly',
    label: { fr: 'x', en: 'x' },
    cadence: 'monthly',
    minutes: 30,
    agenda: [
      { position: 1, label: { fr: 'a', en: 'a' }, minutes: 10, watch: ['accounts_without_next_action'], link: null },
    ],
  }

  it('rituel daily/weekly/rank1 → hors périmètre, jamais un verdict', () => {
    const ritual = { ...monthlyRitual, key: 'weekly', cadence: 'weekly' }
    expect(detectRitualEffectiveness({ ritual, series: [], monthsCovered: 6 })).toBeNull()
  })

  it('aucun point n’observe de compteur de stock → rien à mesurer, pas un verdict d’échec', () => {
    const ritual = {
      ...monthlyRitual,
      agenda: [{ position: 1, label: { fr: 'a', en: 'a' }, minutes: 10, watch: [], link: null }],
    }
    expect(detectRitualEffectiveness({ ritual, series: [], monthsCovered: 6 })).toBeNull()
  })

  it('moins de trois photos → not_evaluable, jamais confondu avec « stable »', () => {
    const report = detectRitualEffectiveness({ ritual: monthlyRitual, series: [], monthsCovered: 1 })
    expect(report?.verdict).toBe('not_evaluable')
  })

  it('l’indicateur observé n’a pas bougé sur trois photos → no_measurable_effect', () => {
    const series = [
      {
        metricKey: 'accounts_without_next_action',
        unit: 'count' as const,
        points: [
          { month: '2026-06', value: 7 },
          { month: '2026-07', value: 7 },
          { month: '2026-08', value: 7 },
        ],
      },
    ]
    const report = detectRitualEffectiveness({ ritual: monthlyRitual, series, monthsCovered: 3 })
    expect(report?.verdict).toBe('no_measurable_effect')
  })

  it('l’indicateur observé a bougé → moved, jamais no_measurable_effect', () => {
    const series = [
      {
        metricKey: 'accounts_without_next_action',
        unit: 'count' as const,
        points: [
          { month: '2026-06', value: 7 },
          { month: '2026-07', value: 5 },
          { month: '2026-08', value: 2 },
        ],
      },
    ]
    const report = detectRitualEffectiveness({ ritual: monthlyRitual, series, monthsCovered: 3 })
    expect(report?.verdict).toBe('moved')
  })

  it('aucune série lisible pour l’indicateur observé → not_evaluable, jamais no_measurable_effect', () => {
    const report = detectRitualEffectiveness({ ritual: monthlyRitual, series: [], monthsCovered: 3 })
    expect(report?.verdict).toBe('not_evaluable')
  })
})

describe('#3298 (suite #3271.11, historique d’occurrence) — depuis quand un rituel est sans effet', () => {
  const monthlyRitual = {
    key: 'monthly',
    label: { fr: 'x', en: 'x' },
    cadence: 'monthly',
    minutes: 30,
    agenda: [
      { position: 1, label: { fr: 'a', en: 'a' }, minutes: 10, watch: ['accounts_without_next_action'], link: null },
    ],
  }

  it('sinceMonth reste null sauf verdict no_measurable_effect', () => {
    const moved = [
      {
        metricKey: 'accounts_without_next_action',
        unit: 'count' as const,
        points: [
          { month: '2026-06', value: 7 },
          { month: '2026-07', value: 5 },
          { month: '2026-08', value: 2 },
        ],
      },
    ]
    expect(detectRitualEffectiveness({ ritual: monthlyRitual, series: moved, monthsCovered: 3 })?.sinceMonth).toBeNull()
    expect(detectRitualEffectiveness({ ritual: monthlyRitual, series: [], monthsCovered: 1 })?.sinceMonth).toBeNull()
  })

  it('sinceMonth DÉRIVE le mois le plus ancien où l’indicateur est resté à sa valeur actuelle', () => {
    // Le verdict compare la PREMIÈRE et la DERNIÈRE photo (7 → 7, aucun
    // mouvement d'ensemble) ; sinceMonth doit quand même repérer que juin a
    // bougé (7→5) avant de revenir, et ne remonter qu'à juillet.
    const series = [
      {
        metricKey: 'accounts_without_next_action',
        unit: 'count' as const,
        points: [
          { month: '2026-05', value: 7 },
          { month: '2026-06', value: 5 },
          { month: '2026-07', value: 7 },
          { month: '2026-08', value: 7 },
        ],
      },
    ]
    const report = detectRitualEffectiveness({ ritual: monthlyRitual, series, monthsCovered: 4 })
    expect(report?.verdict).toBe('no_measurable_effect')
    expect(report?.sinceMonth).toBe('2026-07')
  })

  it('un rituel qui observe DEUX indicateurs repart du plus récemment stabilisé', () => {
    const ritual = {
      ...monthlyRitual,
      agenda: [
        {
          position: 1,
          label: { fr: 'a', en: 'a' },
          minutes: 10,
          watch: ['accounts_without_next_action', 'needs_without_skills'],
          link: null,
        },
      ],
    }
    const series = [
      {
        metricKey: 'accounts_without_next_action',
        unit: 'count' as const,
        points: [
          { month: '2026-05', value: 7 },
          { month: '2026-06', value: 7 },
          { month: '2026-07', value: 7 },
          { month: '2026-08', value: 7 },
        ],
      },
      {
        metricKey: 'needs_without_skills',
        unit: 'count' as const,
        points: [
          { month: '2026-05', value: 3 },
          { month: '2026-06', value: 4 },
          { month: '2026-07', value: 3 },
          { month: '2026-08', value: 3 },
        ],
      },
    ]
    const report = detectRitualEffectiveness({ ritual, series, monthsCovered: 4 })
    expect(report?.verdict).toBe('no_measurable_effect') // chaque indicateur revient à sa valeur de départ (7→7, 3→3)
    // Le premier indicateur est plat depuis mai ; le second a bougé en juin
    // (3→4) avant de revenir en juillet — le RITUEL entier est « sans effet »
    // depuis juillet seulement, le plus récent des deux.
    expect(report?.sinceMonth).toBe('2026-07')
  })
})

describe('#3271.8 reste (suite #3298) — la date suivante, dérivée d’une marque de dernière tenue', () => {
  it('valide la forme de la marque — une date et un auteur, rien de plus', () => {
    expect(() =>
      ritualLastHeldSchema.parse({ ritualKey: 'monthly', heldAt: '2026-09-29T10:00:00.000Z', heldBy: null }),
    ).not.toThrow()
  })

  it('sans marque de dernière tenue → pas de date suivante, jamais inventée', () => {
    expect(nextRitualDate('monthly', null)).toBeNull()
  })

  it('un rituel on_demand n’a pas de date suivante, quelle que soit la marque', () => {
    expect(nextRitualDate('on_demand', '2026-09-29')).toBeNull()
  })

  it('monthly avance d’un mois depuis la dernière tenue', () => {
    expect(nextRitualDate('monthly', '2026-09-29')).toBe('2026-10-29')
  })

  it('quarterly avance de trois mois', () => {
    expect(nextRitualDate('quarterly', '2026-09-29')).toBe('2026-12-29')
  })

  it('weekly avance de sept jours', () => {
    expect(nextRitualDate('weekly', '2026-09-29')).toBe('2026-10-06')
  })
})

describe('ritualActionsCreatedSchema (#3298 / #3271.8, « actions créées »)', () => {
  it('accepte un compte strictement positif par rituel', () => {
    expect(ritualActionsCreatedSchema.parse({ ritualKey: 'monthly', count: 3 }).count).toBe(3)
  })

  it('REFUSE un zéro : une absence ne fait aucune ligne, jamais un « 0 » mesuré', () => {
    expect(() => ritualActionsCreatedSchema.parse({ ritualKey: 'monthly', count: 0 })).toThrow()
  })

  it('REFUSE un rituel hors catalogue', () => {
    expect(() => ritualActionsCreatedSchema.parse({ ritualKey: 'yearly', count: 1 })).toThrow()
  })
})
