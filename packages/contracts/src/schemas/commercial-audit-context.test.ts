import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  auditContradictionSchema,
  auditEvaluableAxes,
  auditMaturityAxisIdValues,
  auditMaturityAxisSchema,
  auditMaturityAxisStateValues,
  auditMaturityLevelValues,
  auditMaturitySchema,
  auditMilestoneSchema,
  auditProductAreaValues,
  auditProductParameterSchema,
  auditScoreWithAxesSchema,
  auditWeekSchema,
  commercialAuditContextSchema,
  commercialTensionRuleIdValues,
  COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION,
  MAX_WEEKLY_PRIORITIES,
  MINIMUM_SCORE_AXES,
} from './commercial-audit-context.js'

/**
 * #2061 — le témoin que le contrat n'est pas nu et sait dire NON.
 */
describe('commercialAuditContextSchema — le corpus n’est pas vide', () => {
  it('porte au moins les 18 blocs de contenu listés au registre (#2061.2-.20)', () => {
    const keys = Object.keys(commercialAuditContextSchema.shape)
    expect(keys.length).toBeGreaterThanOrEqual(18)
    for (const expected of [
      'scope',
      'facts',
      'unknowns',
      'contradictions',
      'assets',
      'constraints',
      'currentCommercialMachine',
      'funnel',
      'breakpoints',
      'maturity',
      'strategicOptions',
      'recommendedDirection',
      'stopKeepReinforce',
      'thirtyDayPlan',
      'conditionalRoadmap',
      'productPersonalization',
      'questionsToRevisit',
    ]) {
      expect(keys, expected).toContain(expected)
    }
  })

  it('#2068 — porte aussi les paliers et la configuration produit, EN PLUS de productPersonalization', () => {
    const keys = Object.keys(commercialAuditContextSchema.shape)
    expect(keys).toContain('milestones')
    expect(keys).toContain('productConfiguration')
    // #2068.22 — pas un second chemin qui répondrait AUTRE CHOSE : les deux
    // blocs coexistent, ils ne se remplacent pas.
    expect(keys).toContain('productPersonalization')
  })

  it('est VERSIONNÉ — le schéma se lit sur l’objet, jamais deviné par l’écran', () => {
    const parsed = commercialAuditContextSchema.parse(minimalContext())
    expect(parsed.schemaVersion).toBe(COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION)
  })

  it('#2061.24 — `generatedAt` et `profileContextVersion` sont la MÊME référence, ensemble', () => {
    const parsed = commercialAuditContextSchema.parse({
      ...minimalContext(),
      profileContextVersion: 7,
      generatedAt: '2026-09-12T08:00:00.000Z',
    })
    expect(parsed.profileContextVersion).toBe(7)
    expect(parsed.generatedAt).toBe('2026-09-12T08:00:00.000Z')
  })

  it('sans instantané de profil, la date et la version restent `null` ENSEMBLE — jamais un `new Date()` inventé', () => {
    const parsed = commercialAuditContextSchema.parse(minimalContext())
    expect(parsed.generatedAt).toBeNull()
    expect(parsed.profileContextVersion).toBeNull()
  })

  it('un bloc ABSENT reste `null` — jamais une valeur inventée', () => {
    const parsed = commercialAuditContextSchema.parse(minimalContext())
    expect(parsed.facts).toBeNull()
    expect(parsed.strategicOptions).toBeNull()
  })
})

describe('auditScoreWithAxesSchema — un score n’est jamais nu', () => {
  it('REFUSE un score porté par moins de 3 axes évalués (rouge attendu)', () => {
    expect(() =>
      auditScoreWithAxesSchema.parse({
        score: 42,
        max: 100,
        axes: [
          { label: 'Clarté', score: 40 },
          { label: 'Preuves', score: 44 },
        ],
        reason: null,
      }),
    ).toThrow(/moins de 3 axes/)
  })

  it('ACCEPTE un score porté par 3 axes évalués ou plus', () => {
    const parsed = auditScoreWithAxesSchema.parse({
      score: 42,
      max: 100,
      axes: [
        { label: 'Clarté', score: 40 },
        { label: 'Preuves', score: 44 },
        { label: 'Ciblage', score: 42 },
      ],
      reason: null,
    })
    expect(parsed.score).toBe(42)
  })

  it('ACCEPTE un score `null` même avec des axes non évaluables — les axes restent visibles', () => {
    const parsed = auditScoreWithAxesSchema.parse({
      score: null,
      max: 100,
      axes: [
        { label: 'Clarté', score: null },
        { label: 'Preuves', score: null },
      ],
      reason: 'non mesuré',
    })
    expect(parsed.score).toBeNull()
    expect(parsed.axes).toHaveLength(2)
  })

  it('un axe non évaluable SORT du dénominateur — `auditEvaluableAxes` ne le compte jamais', () => {
    expect(auditEvaluableAxes([{ score: 10 }, { score: null }, { score: 20 }, { score: null }, { score: 30 }])).toBe(
      MINIMUM_SCORE_AXES,
    )
    expect(auditEvaluableAxes([{ score: null }, { score: null }])).toBe(0)
  })
})

describe('auditWeekSchema — #2068.1-.13, trois priorités par semaine, quatre semaines', () => {
  it('REFUSE plus de 3 priorités sur une semaine (#2068.2, #2068.13 — pas 15 projets)', () => {
    expect(MAX_WEEKLY_PRIORITIES).toBe(3)
    expect(() =>
      auditWeekSchema.parse({
        weekNumber: 1,
        priorities: [
          minimalPriority('Un'),
          minimalPriority('Deux'),
          minimalPriority('Trois'),
          minimalPriority('Quatre'),
        ],
      }),
    ).toThrow()
  })

  it('ACCEPTE jusqu’à 3 priorités, chacune avec ses 8 champs (#2068.3-.10)', () => {
    const parsed = auditWeekSchema.parse({
      weekNumber: 1,
      priorities: [
        {
          expectedResult: 'Trois RDV qualifiés pris',
          action: 'Relancer les 12 comptes du plan',
          owner: 'Le commercial',
          slot: null,
          dependency: null,
          completionProof: null,
          surfaceLink: null,
          replacementCondition: null,
        },
      ],
    })
    expect(parsed.priorities).toHaveLength(1)
    expect(parsed.priorities[0]?.expectedResult).toBe('Trois RDV qualifiés pris')
  })

  it('#2068.13 — ne suppose jamais un créneau : `slot` reste `null` sans invention', () => {
    const parsed = auditWeekSchema.parse({ weekNumber: 1, priorities: [minimalPriority('Une action')] })
    expect(parsed.priorities[0]?.slot).toBeNull()
  })

  it('#2068.24-.31 — `domain` défaut à `null` (additif) : un plan sérialisé avant ce lot reste lisible', () => {
    const parsed = auditWeekSchema.parse({ weekNumber: 1, priorities: [minimalPriority('Une action')] })
    expect(parsed.priorities[0]?.domain).toBeNull()
  })

  it('#2068.24-.31 — `domain` ACCEPTE une aire produit NOMMÉE parmi `auditProductAreaValues`', () => {
    const parsed = auditWeekSchema.parse({
      weekNumber: 1,
      priorities: [{ ...minimalPriority('Relancer le DSI'), domain: 'contacts' }],
    })
    expect(parsed.priorities[0]?.domain).toBe('contacts')
  })

  it('#2068.24-.31 — `domain` REFUSE une valeur hors de la liste FERMÉE', () => {
    expect(() =>
      auditWeekSchema.parse({
        weekNumber: 1,
        priorities: [{ ...minimalPriority('Relancer le DSI'), domain: 'billing' }],
      }),
    ).toThrow()
  })
})

describe('thirtyDayPlan — #2068.1, #2068.12, exactement 4 semaines quand il existe', () => {
  it('REFUSE un plan à 3 ou 5 semaines — la revue hebdomadaire ne saute jamais une semaine', () => {
    expect(() =>
      commercialAuditContextSchema.parse({
        ...minimalContext(),
        thirtyDayPlan: [{ weekNumber: 1, priorities: [] }],
      }),
    ).toThrow()
  })

  it('ACCEPTE un plan à 4 semaines', () => {
    const parsed = commercialAuditContextSchema.parse({
      ...minimalContext(),
      thirtyDayPlan: [1, 2, 3, 4].map(weekNumber => ({ weekNumber, priorities: [] })),
    })
    expect(parsed.thirtyDayPlan).toHaveLength(4)
  })
})

describe('auditMilestoneSchema — #2068.14-.21, les 4 paliers', () => {
  it('porte les 4 horizons nommés (#2068.19)', () => {
    for (const horizon of ['60d', '90d', '6m', '12m'] as const) {
      expect(() => auditMilestoneSchema.parse(minimalMilestone(horizon))).not.toThrow()
    }
  })

  it('#2068.21 — aucun champ de date ne fait avancer un palier tout seul, `passageCondition` reste la seule porte', () => {
    const keys = Object.keys(auditMilestoneSchema.shape)
    for (const forbidden of ['dueDate', 'targetDate', 'deadline', 'autoAdvanceAt', 'date']) {
      expect(keys, forbidden).not.toContain(forbidden)
    }
    expect(keys).toContain('passageCondition')
  })

  it('#2068.20 — un palier ne porte aucun CHIFFRE NU : « trajectoire, jamais une promesse »', () => {
    for (const [key, fieldSchema] of Object.entries(auditMilestoneSchema.shape)) {
      expect(fieldSchema instanceof z.ZodNumber, key).toBe(false)
    }
  })

  it('porte les 5 champs du palier 60 j (#2068.14-.18)', () => {
    const parsed = auditMilestoneSchema.parse({
      horizon: '60d',
      systemObjective: 'La revue hebdomadaire tourne sans relance manuelle',
      expectedProof: 'Trois revues consécutives tenues',
      passageCondition: 'Les trois priorités de chaque semaine ont un owner et une preuve',
      decisionToMake: 'Garder le rythme ou réduire à 2 priorités/semaine',
      correctionIfNotReached: 'Revenir à 1 priorité/semaine avant de reprendre 3',
    })
    expect(parsed.systemObjective).toContain('revue hebdomadaire')
  })
})

describe('auditProductParameterSchema — #2068.22-.33, la configuration effective de Laura', () => {
  it('#2068.23-.31 — les 9 aires produit sont nommées', () => {
    expect(auditProductAreaValues).toEqual([
      'discover',
      'scoring',
      'contacts',
      'orgGraph',
      'messages',
      'sequences',
      'reverseMarket',
      'routinesPilotageNotifications',
      'matchingActionPlan',
    ])
  })

  it('#2068.33 — REFUSE un paramètre qui porte une VALEUR sans trace vers une conclusion validée', () => {
    expect(() =>
      auditProductParameterSchema.parse({
        key: 'contactLevel',
        value: 'Décideur',
        trace: null,
      }),
    ).toThrow(/#2068\.33/)
  })

  it('#2068.33 — ACCEPTE un paramètre dont la valeur remonte à une conclusion validée', () => {
    const parsed = auditProductParameterSchema.parse({
      key: 'contactLevel',
      value: 'Décideur',
      trace: { statement: 'Le profil confirme un ciblage niveau décideur', provenance: null },
    })
    expect(parsed.value).toBe('Décideur')
  })

  it('ACCEPTE un paramètre sans valeur ENCORE établie, sans trace exigée — non mesuré n’est pas inventé', () => {
    expect(() => auditProductParameterSchema.parse({ key: 'tone', value: null, trace: null })).not.toThrow()
  })
})

// #2064.13-.17 — chaque contradiction porte les 5 champs, plus l'identité de
// la RÈGLE qui l'a détectée (`ruleId`) : sans elle, l'écran ne peut ni
// localiser un libellé de tension ni compter « combien de fois la règle X
// s'est déclenchée » — deux besoins qu'une phrase seule ne sert pas.
describe('auditContradictionSchema — #2064.13-.17 + #2066.18, les 18 règles nommées', () => {
  it('porte les 18 identités de règle (#2064.1-.12, #2066.11-.16), les 12 d’abord — GA-08', () => {
    expect(commercialTensionRuleIdValues).toHaveLength(18)
    expect(commercialTensionRuleIdValues.slice(0, 12)).toEqual([
      'objectivesAboveCapacity',
      'tooManySimultaneousMarkets',
      'offerWithoutProof',
      'acquisitionWithoutRoutine',
      'poolWithoutAvailability',
      'needsWithoutQualification',
      'profilesWithoutCommitment',
      'keyAccountsWithoutAccessPath',
      'partnersWithoutEconomicsOrFeedback',
      'contentWithoutCommercialUse',
      'rfpsWithoutGoNoGo',
      'missionsWithoutCapitalisation',
    ])
  })

  it('REFUSE une contradiction sans identité de règle valide', () => {
    expect(() =>
      auditContradictionSchema.parse({
        ruleId: 'not_a_rule',
        facts: [],
        tension: 'x',
        possibleExplanation: null,
        questionToValidate: null,
        consequenceIfUnaddressed: null,
        recommendation: 'y',
        indicator: 'z',
        confidence: null,
      }),
    ).toThrow()
  })

  it('#2066.18 — REFUSE une contradiction sans recommandation ni indicateur : un constat n’est pas un audit', () => {
    expect(() =>
      auditContradictionSchema.parse({
        ruleId: 'tooManySimultaneousMarkets',
        facts: [],
        tension: 'x',
        possibleExplanation: null,
        questionToValidate: null,
        consequenceIfUnaddressed: null,
        confidence: null,
      }),
    ).toThrow()
  })

  it('ACCEPTE une contradiction complète, avec ses FAITS, sa question à valider, sa recommandation et son indicateur (#2064.13/.16, #2066.18)', () => {
    const parsed = auditContradictionSchema.parse({
      ruleId: 'tooManySimultaneousMarkets',
      facts: ['4 secteurs prioritaires nommés'],
      tension: 'Trop de marchés simultanés pour une capacité commerciale non démultipliée.',
      possibleExplanation: 'Une phase exploratoire, avant resserrement.',
      questionToValidate: 'Combien de secteurs comptes-tu vraiment travailler ce trimestre ?',
      consequenceIfUnaddressed: 'La prospection se disperse et aucun secteur ne devient un point fort reconnu.',
      recommendation: 'Resserrer la liste des secteurs prioritaires à trois au maximum pour ce trimestre.',
      indicator: 'Nombre de secteurs prioritaires nommés simultanément.',
      confidence: 'deduced',
    })
    expect(parsed.facts).toEqual(['4 secteurs prioritaires nommés'])
    expect(parsed.ruleId).toBe('tooManySimultaneousMarkets')
    expect(parsed.recommendation).not.toHaveLength(0)
    expect(parsed.indicator).not.toHaveLength(0)
  })
})

// #2066.19/.27 — 2 à 5 voies stratégiques, jamais moins, jamais plus : « un
// audit qui recommande tout ne recommande rien ». La borne est un livrable,
// pas un détail d'affichage, donc elle vit ICI et se garde dans les deux sens.
describe('auditStrategicOptionSchema / strategicOptions — 2 à 5 voies, jamais un quatrième bord', () => {
  function option(label: string) {
    return { label, potential: null, prerequisite: null, limit: null, load: null }
  }

  it('REFUSE moins de 2 voies (une seule option n’est pas un choix)', () => {
    expect(() =>
      commercialAuditContextSchema.parse({ ...minimalContext(), strategicOptions: [option('Chasse directe')] }),
    ).toThrow()
  })

  it('REFUSE plus de 5 voies (garde le NON — dépasser la borne doit rougir)', () => {
    expect(() =>
      commercialAuditContextSchema.parse({
        ...minimalContext(),
        strategicOptions: [1, 2, 3, 4, 5, 6].map(n => option(`Voie ${n}`)),
      }),
    ).toThrow()
  })

  it('ACCEPTE entre 2 et 5 voies', () => {
    const parsed = commercialAuditContextSchema.parse({
      ...minimalContext(),
      strategicOptions: [option('Chasse directe'), option('Partenariats')],
    })
    expect(parsed.strategicOptions).toHaveLength(2)
  })

  it('ACCEPTE `null` — aucune voie calculée reste un bloc absent, pas une liste vide inventée', () => {
    const parsed = commercialAuditContextSchema.parse(minimalContext())
    expect(parsed.strategicOptions).toBeNull()
  })
})

describe('auditMaturityAxisSchema — #2065.13-.18, un axe n’est jamais nu', () => {
  it('porte les 12 axes nommés (#2065.1-.12) plus le treizième axe réseau (#2860, #2045.12-.14)', () => {
    expect(auditMaturityAxisIdValues).toHaveLength(13)
    expect(auditMaturityAxisIdValues).toContain('network')
  })

  it('porte les 3 états nommés (#2065.13) et les 4 niveaux nommés (#2065.14)', () => {
    expect(auditMaturityAxisStateValues).toEqual(['measured', 'partial', 'unknown'])
    expect(auditMaturityLevelValues).toHaveLength(4)
  })

  it('REFUSE un axe « inconnu » qui porte quand même un score — ce serait un zéro déguisé', () => {
    expect(() =>
      auditMaturityAxisSchema.parse({
        id: 'proof',
        label: 'Preuves',
        state: 'unknown',
        score: 2,
        level: null,
        evidence: null,
        gaps: ['Aucune preuve enregistrée'],
        nextLever: null,
        confidence: null,
      }),
    ).toThrow(/inconnu/)
  })

  it('ACCEPTE un axe « mesuré », avec ses preuves (#2065.15) et son levier suivant (#2065.18)', () => {
    const parsed = auditMaturityAxisSchema.parse({
      id: 'offerClarity',
      label: 'Clarté de l’offre',
      state: 'measured',
      score: 3,
      level: 'structured',
      evidence: ['Angle de valeur formulé', '2 points de différenciation nommés'],
      gaps: [],
      nextLever: 'Faire valider cet angle par un client existant.',
      confidence: 'single_source',
    })
    expect(parsed.evidence).toHaveLength(2)
    expect(parsed.nextLever).toContain('valider')
  })

  it('ACCEPTE un axe « inconnu » sans score, avec son GAP nommé (#2065.16) — jamais silencieux', () => {
    const parsed = auditMaturityAxisSchema.parse({
      id: 'candidateSecurisation',
      label: 'Sécurisation candidat',
      state: 'unknown',
      score: null,
      level: null,
      evidence: null,
      gaps: ['Aucune donnée de sécurisation candidat mesurée'],
      nextLever: null,
      confidence: null,
    })
    expect(parsed.gaps).toContain('Aucune donnée de sécurisation candidat mesurée')
  })
})

describe('auditMaturitySchema — le score global reste sous la même loi (#2065, sous 3 axes évalués il n’y a pas de score)', () => {
  function axis(overrides: Partial<z.infer<typeof auditMaturityAxisSchema>>) {
    return {
      id: 'offerClarity' as const,
      label: 'Clarté de l’offre',
      state: 'unknown' as const,
      score: null,
      level: null,
      evidence: null,
      gaps: ['non mesuré'],
      nextLever: null,
      confidence: null,
      ...overrides,
    }
  }

  it('REFUSE un score global porté par moins de 3 axes évalués', () => {
    expect(() =>
      auditMaturitySchema.parse({
        score: 5,
        max: 9,
        axes: [
          axis({ id: 'offerClarity', state: 'measured', score: 2 }),
          axis({ id: 'proof', state: 'measured', score: 3 }),
        ],
        reason: null,
      }),
    ).toThrow(/moins de 3 axes/)
  })

  it('ACCEPTE un score global porté par 3 axes évalués ou plus, les axes inconnus restant NOMMÉS à côté', () => {
    const parsed = auditMaturitySchema.parse({
      score: 8,
      max: 9,
      axes: [
        axis({ id: 'offerClarity', state: 'measured', score: 3 }),
        axis({ id: 'proof', state: 'measured', score: 2 }),
        axis({ id: 'targeting', state: 'measured', score: 3 }),
        axis({ id: 'access', state: 'unknown', score: null }),
      ],
      reason: null,
    })
    expect(parsed.score).toBe(8)
    expect(parsed.axes.find(a => a.id === 'access')?.state).toBe('unknown')
  })
})

function minimalPriority(action: string) {
  return {
    expectedResult: action,
    action,
    owner: null,
    slot: null,
    dependency: null,
    completionProof: null,
    surfaceLink: null,
    replacementCondition: null,
  }
}

function minimalMilestone(horizon: '60d' | '90d' | '6m' | '12m') {
  return {
    horizon,
    systemObjective: null,
    expectedProof: null,
    passageCondition: null,
    decisionToMake: null,
    correctionIfNotReached: null,
  }
}

function minimalContext() {
  return {
    schemaVersion: COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION,
    generatedAt: null,
    profileContextVersion: null,
    scope: null,
    facts: null,
    unknowns: null,
    contradictions: null,
    assets: null,
    constraints: null,
    currentCommercialMachine: null,
    funnel: null,
    breakpoints: null,
    maturity: null,
    strategicOptions: null,
    recommendedDirection: null,
    stopKeepReinforce: null,
    thirtyDayPlan: null,
    conditionalRoadmap: null,
    productPersonalization: null,
    questionsToRevisit: null,
    milestones: null,
    productConfiguration: null,
    // #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — `null` = aucune
    // réponse du questionnaire n'a pu être lue, jamais « il n'y en a pas ».
    declaredSignals: null,
    // #2067.2 / .4 / .5 / .6 — `null` = l'arbitrage n'a pas été dérivé, jamais « tout vaut 0 ».
    activeLoad: null,
  }
}

describe('#2049.15 — le funnel nomme ce qui n’est PAS compté', () => {
  it('une étape porte son état de MESURE, distinct de son compte', () => {
    const parsed = commercialAuditContextSchema.parse({
      ...minimalContext(),
      funnel: [{ stage: 'Réponses obtenues', count: null, measurement: 'notTracked' }],
    })
    expect(parsed.funnel?.[0]).toEqual({ stage: 'Réponses obtenues', count: null, measurement: 'notTracked' })
  })

  it('ADDITIF — un audit sérialisé AVANT ce lot reste lisible, et son silence vaut « non mesuré »', () => {
    const parsed = commercialAuditContextSchema.parse({
      ...minimalContext(),
      funnel: [{ stage: 'Comptes travaillés', count: null }],
    })
    expect(parsed.funnel?.[0]?.measurement).toBeNull()
  })

  it('REFUSE un état de mesure inventé — la liste est FERMÉE', () => {
    expect(() =>
      commercialAuditContextSchema.parse({
        ...minimalContext(),
        funnel: [{ stage: 'Comptes travaillés', count: null, measurement: 'probablement' }],
      }),
    ).toThrow()
  })
})

describe('declaredSignals — les cinq signaux du questionnaire entrent au contrat', () => {
  it('ACCEPTE `null` : aucune réponse lue n’est un bloc ABSENT, pas un bloc vide', () => {
    expect(commercialAuditContextSchema.parse(minimalContext()).declaredSignals).toBeNull()
  })

  it('ACCEPTE les cinq signaux, chacun dans son état « non déclaré »', () => {
    const parsed = commercialAuditContextSchema.parse({
      ...minimalContext(),
      declaredSignals: {
        funnelBreak: { kind: 'notDeclared' },
        startingPoint: { kind: 'notDeclared' },
        entryAxis: { kind: 'notDeclared' },
        frontsBudget: { kind: 'notDeclared' },
        routineSeeds: { kind: 'notDeclared' },
      },
    })
    expect(parsed.declaredSignals?.entryAxis.kind).toBe('notDeclared')
  })

  it('REFUSE un signal amputé — un axe mesuré sans sa réponse source ne parse pas', () => {
    expect(() =>
      commercialAuditContextSchema.parse({
        ...minimalContext(),
        declaredSignals: {
          funnelBreak: { kind: 'notDeclared' },
          startingPoint: { kind: 'notDeclared' },
          entryAxis: { kind: 'measured', axis: 'topDown' },
          frontsBudget: { kind: 'notDeclared' },
          routineSeeds: { kind: 'notDeclared' },
        },
      }),
    ).toThrow()
  })
})

describe('activeLoad — l’arbitrage de la charge active entre au contrat (#2067.2/.4/.5/.6)', () => {
  it('le contrat porte le bloc, et `null` y reste un bloc ABSENT', () => {
    expect(Object.keys(commercialAuditContextSchema.shape)).toContain('activeLoad')
    expect(commercialAuditContextSchema.parse(minimalContext()).activeLoad).toBeNull()
  })

  it('ACCEPTE les quatre grandeurs « non établies », chacune NOMMANT la réponse qui manque', () => {
    const absent = { kind: 'answerMissing', missingAnswers: ['weekly_sales_time_protected'] }
    const parsed = commercialAuditContextSchema.parse({
      ...minimalContext(),
      activeLoad: { partners: absent, slots: absent, reserve: absent, deferred: absent },
    })
    expect(parsed.activeLoad?.reserve.kind).toBe('answerMissing')
  })

  it('REFUSE une grandeur non établie qui porterait un chiffre de repli', () => {
    const absent = { kind: 'answerMissing', missingAnswers: ['go_to_market_channels'] }
    expect(() =>
      commercialAuditContextSchema.parse({
        ...minimalContext(),
        activeLoad: { partners: absent, slots: absent, reserve: absent, deferred: { ...absent, count: 0 } },
      }),
    ).toThrow()
  })
})
