import { describe, expect, it } from 'vitest'
import type { ProfileContext, Submission } from '@bellum/contracts'
import { auditMovesFrom, commercialTensionRuleIdValues } from '@bellum/contracts'
import {
  commercialTensionSignalsFromContactFollowUps,
  commercialTensionSignalsFromNeeds,
  commercialTensionSignalsFromRenewals,
  commercialTensionSignalsFromSubmissions,
  commercialTensionSignalsFromTalentStats,
  detectAcquisitionWithoutRoutine,
  detectCommercialTensions,
  detectContactWithoutFollowUpDate,
  detectContentWithoutCommercialUse,
  detectInterviewWithoutFollowUp,
  detectKeyAccountsWithoutAccessPath,
  detectMissionsWithoutCapitalisation,
  detectMissionWithoutRenewal,
  detectNeedReducedToTitle,
  detectNeedsWithoutQualification,
  detectObjectivesAboveCapacity,
  detectOfferWithoutProof,
  detectPartnersWithoutEconomicsOrFeedback,
  detectPoolWithoutAvailability,
  detectProfilesWithoutCommitment,
  detectRfpsWithoutGoNoGo,
  detectTooManySimultaneousMarkets,
  MAX_SIMULTANEOUS_MARKETS,
  NEEDS_QUALIFICATION_MIN_RATIO,
} from './tension-detectors'

/**
 * #2064.1-.12 — chaque détecteur est une RÈGLE NOMMÉE, pas une heuristique
 * floue. Ce fichier garde le corollaire du lot : tant qu'un détecteur n'a pas
 * de fait à lire, il rend « inconnu », jamais « rien à signaler » — les deux
 * sont des choses différentes, et un test par état le prouve pour chacun.
 */

const BASE_IDEAL: ProfileContext['idealAccountProfile'] = {
  size: 'eti',
  sectorsPriority: ['Banque', 'Assurance'],
  decisionLevel: 'manager',
  entryStrategy: 'multiThread',
}

describe('detectObjectivesAboveCapacity — #2064.1', () => {
  it('rend « inconnu » sans coachingInsights — pas de fait à lire', () => {
    const outcome = detectObjectivesAboveCapacity(undefined)
    expect(outcome.status).toBe('unknown')
  })

  it('rend « inconnu » sans objectif chiffré (kpiTargets absent)', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      coachingInsights: {
        mainWeakness: 'x',
        keyAdvice: 'y',
        cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 8 },
      },
    }
    expect(detectObjectivesAboveCapacity(context).status).toBe('unknown')
  })

  it('déclenche quand l’objectif dépasse la capacité mensuelle impliquée par la cadence', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      coachingInsights: {
        mainWeakness: 'x',
        keyAdvice: 'y',
        cadenceRecommendation: { analysesPerWeek: 2, messagesPerDay: 5, followUpsPerWeek: 8 },
        kpiTargets: { accountsPerMonth: 20, rdvPerMonth: 5, conversionRateTarget: '10%' },
      },
    }
    const outcome = detectObjectivesAboveCapacity(context)
    expect(outcome.status).toBe('triggered')
    if (outcome.status === 'triggered') {
      expect(outcome.contradiction.ruleId).toBe('objectivesAboveCapacity')
      expect(outcome.contradiction.facts.join(' ')).toContain('20')
    }
  })

  it('reste « clear » quand l’objectif tient dans la capacité impliquée', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      coachingInsights: {
        mainWeakness: 'x',
        keyAdvice: 'y',
        cadenceRecommendation: { analysesPerWeek: 5, messagesPerDay: 5, followUpsPerWeek: 8 },
        kpiTargets: { accountsPerMonth: 10, rdvPerMonth: 5, conversionRateTarget: '10%' },
      },
    }
    expect(detectObjectivesAboveCapacity(context).status).toBe('clear')
  })
})

describe('detectTooManySimultaneousMarkets — #2064.2', () => {
  it('rend « inconnu » sans profil de compte idéal', () => {
    expect(detectTooManySimultaneousMarkets(undefined).status).toBe('unknown')
  })

  it(`déclenche au-delà de ${MAX_SIMULTANEOUS_MARKETS} secteurs prioritaires`, () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: { ...BASE_IDEAL, sectorsPriority: ['A', 'B', 'C', 'D'] },
    }
    const outcome = detectTooManySimultaneousMarkets(context)
    expect(outcome.status).toBe('triggered')
    if (outcome.status === 'triggered') expect(outcome.contradiction.ruleId).toBe('tooManySimultaneousMarkets')
  })

  it(`reste « clear » à ${MAX_SIMULTANEOUS_MARKETS} secteurs ou moins`, () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: { ...BASE_IDEAL, sectorsPriority: ['A', 'B'] },
    }
    expect(detectTooManySimultaneousMarkets(context).status).toBe('clear')
  })
})

describe('detectTooManySimultaneousMarkets — #4422.3 spécialisation fonctionnelle', () => {
  const FIVE_SECTORS: ProfileContext = {
    esnArchetype: 'boutiqueExpert',
    sellingPosture: 'expertiseRare',
    idealAccountProfile: {
      ...BASE_IDEAL,
      sectorsPriority: ['Transport', 'Logistique', 'Industrie', 'Distribution', 'Agroalimentaire'],
    },
  }

  it('forfait spécialisé sur une fonction, 5 secteurs → AUCUN verdict de dispersion', () => {
    expect(detectTooManySimultaneousMarkets(FIVE_SECTORS, { functionalSpecialization: true }).status).toBe('clear')
  })

  it('régie multi-métiers, 5 secteurs → la dispersion est conservée', () => {
    expect(detectTooManySimultaneousMarkets(FIVE_SECTORS, { functionalSpecialization: false }).status).toBe('triggered')
    expect(detectTooManySimultaneousMarkets(FIVE_SECTORS).status).toBe('triggered')
  })
})

describe('detectOfferWithoutProof — #2064.3', () => {
  it('rend « inconnu » sans style de messagerie', () => {
    expect(detectOfferWithoutProof(undefined).status).toBe('unknown')
  })

  it('déclenche quand un angle de valeur existe sans aucun point de différenciation', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      messagingStyle: {
        tone: 'directExpert',
        messageLength: 'concise',
        valuePropositionAngle: 'Expertise cloud rare',
        differentiationPoints: [],
        avoid: [],
      },
    }
    const outcome = detectOfferWithoutProof(context)
    expect(outcome.status).toBe('triggered')
    if (outcome.status === 'triggered') expect(outcome.contradiction.ruleId).toBe('offerWithoutProof')
  })

  it('reste « clear » quand au moins un point de différenciation est nommé', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      messagingStyle: {
        tone: 'directExpert',
        messageLength: 'concise',
        valuePropositionAngle: 'Expertise cloud rare',
        differentiationPoints: ['Référence vérifiable'],
        avoid: [],
      },
    }
    expect(detectOfferWithoutProof(context).status).toBe('clear')
  })
})

describe('detectAcquisitionWithoutRoutine — #2064.4', () => {
  it('rend « inconnu » sans cadence recommandée — rien ne dit qu’il y a une cible d’acquisition', () => {
    expect(detectAcquisitionWithoutRoutine(undefined).status).toBe('unknown')
  })

  it('déclenche quand une cadence est recommandée sans paramètres d’analyse configurés', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      coachingInsights: {
        mainWeakness: 'x',
        keyAdvice: 'y',
        cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 8 },
      },
    }
    const outcome = detectAcquisitionWithoutRoutine(context)
    expect(outcome.status).toBe('triggered')
    if (outcome.status === 'triggered') expect(outcome.contradiction.ruleId).toBe('acquisitionWithoutRoutine')
  })

  it('reste « clear » quand des paramètres d’analyse sont configurés', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      coachingInsights: {
        mainWeakness: 'x',
        keyAdvice: 'y',
        cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 8 },
      },
      analysisParameters: {
        braveQueriesCount: 12,
        firecrawlPagesCount: 6,
        contactsTarget: 40,
        analysisDepth: 'standard',
        maxTokensResearch: 12000,
        focusAreas: [],
      },
    }
    expect(detectAcquisitionWithoutRoutine(context).status).toBe('clear')
  })
})

describe('detectKeyAccountsWithoutAccessPath — #2064.8', () => {
  it('rend « inconnu » sans profil de compte idéal', () => {
    expect(detectKeyAccountsWithoutAccessPath(undefined).status).toBe('unknown')
  })

  it('déclenche pour un grand compte visé avec une entrée par le terrain', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: { ...BASE_IDEAL, size: 'grandCompte', entryStrategy: 'bottomUp' },
    }
    const outcome = detectKeyAccountsWithoutAccessPath(context)
    expect(outcome.status).toBe('triggered')
    if (outcome.status === 'triggered') expect(outcome.contradiction.ruleId).toBe('keyAccountsWithoutAccessPath')
  })

  it('reste « clear » pour un grand compte visé avec une entrée multi-fils', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: { ...BASE_IDEAL, size: 'grandCompte', entryStrategy: 'multiThread' },
    }
    expect(detectKeyAccountsWithoutAccessPath(context).status).toBe('clear')
  })

  it('reste « clear » pour une PME visée avec une entrée par le terrain — le terrain N’EST PAS le problème', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: { ...BASE_IDEAL, size: 'pme', entryStrategy: 'bottomUp' },
    }
    expect(detectKeyAccountsWithoutAccessPath(context).status).toBe('clear')
  })
})

describe('les 7 détecteurs à signal externe — #2064.5/.6/.7/.9/.10/.11/.12', () => {
  it('rendent tous « inconnu » quand aucun signal n’est encore relié (aujourd’hui, en production)', () => {
    expect(detectPoolWithoutAvailability(undefined).status).toBe('unknown')
    expect(detectNeedsWithoutQualification(undefined).status).toBe('unknown')
    expect(detectProfilesWithoutCommitment(undefined).status).toBe('unknown')
    expect(detectPartnersWithoutEconomicsOrFeedback(undefined).status).toBe('unknown')
    expect(detectContentWithoutCommercialUse(undefined).status).toBe('unknown')
    expect(detectRfpsWithoutGoNoGo(undefined).status).toBe('unknown')
    expect(detectMissionsWithoutCapitalisation(undefined).status).toBe('unknown')
  })

  it('detectPoolWithoutAvailability déclenche quand le vivier existe et rien n’est disponible', () => {
    const outcome = detectPoolWithoutAvailability(undefined, { candidatePool: { total: 6, availableNow: 0 } })
    expect(outcome.status).toBe('triggered')
  })

  it('detectPoolWithoutAvailability reste « clear » quand au moins un profil est disponible', () => {
    const outcome = detectPoolWithoutAvailability(undefined, { candidatePool: { total: 6, availableNow: 2 } })
    expect(outcome.status).toBe('clear')
  })

  it(`detectNeedsWithoutQualification déclenche sous ${NEEDS_QUALIFICATION_MIN_RATIO * 100}% de qualification`, () => {
    const outcome = detectNeedsWithoutQualification(undefined, { clientNeeds: { total: 10, qualified: 2 } })
    expect(outcome.status).toBe('triggered')
  })

  it('detectNeedsWithoutQualification reste « clear » au-dessus du seuil', () => {
    const outcome = detectNeedsWithoutQualification(undefined, { clientNeeds: { total: 10, qualified: 8 } })
    expect(outcome.status).toBe('clear')
  })

  it('detectProfilesWithoutCommitment déclenche sans aucun engagement client', () => {
    expect(
      detectProfilesWithoutCommitment(undefined, { candidateSubmissions: { total: 4, withClientEngagement: 0 } })
        .status,
    ).toBe('triggered')
  })

  it('detectPartnersWithoutEconomicsOrFeedback déclenche sans économie ni feedback (voisin `apps/api/src/modules/partners`)', () => {
    expect(
      detectPartnersWithoutEconomicsOrFeedback(undefined, {
        partners: { total: 3, withEconomics: 0, withFeedback: 1 },
      }).status,
    ).toBe('triggered')
  })

  it('detectPartnersWithoutEconomicsOrFeedback reste « clear » quand économie ET feedback sont connus', () => {
    expect(
      detectPartnersWithoutEconomicsOrFeedback(undefined, {
        partners: { total: 3, withEconomics: 3, withFeedback: 3 },
      }).status,
    ).toBe('clear')
  })

  it('detectContentWithoutCommercialUse déclenche sans aucune exploitation commerciale', () => {
    expect(detectContentWithoutCommercialUse(undefined, { content: { total: 5, withCommercialUse: 0 } }).status).toBe(
      'triggered',
    )
  })

  it('detectRfpsWithoutGoNoGo déclenche sur un appel d’offres sans décision (voisin `apps/api/src/modules/rfp` + `decision-gates`)', () => {
    expect(detectRfpsWithoutGoNoGo(undefined, { rfps: { total: 3, withDecision: 2 } }).status).toBe('triggered')
  })

  it('detectRfpsWithoutGoNoGo reste « clear » quand chaque appel d’offres porte une décision', () => {
    expect(detectRfpsWithoutGoNoGo(undefined, { rfps: { total: 3, withDecision: 3 } }).status).toBe('clear')
  })

  it('detectMissionsWithoutCapitalisation déclenche sur des missions terminées sans capitalisation (voisin `apps/api/src/modules/capitalisation`)', () => {
    expect(
      detectMissionsWithoutCapitalisation(undefined, { missions: { completed: 4, withCapitalisation: 0 } }).status,
    ).toBe('triggered')
  })
})

describe('detectCommercialTensions — l’agrégateur, l’APPELANT de `build-audit.ts`', () => {
  it('sépare les tensions déclenchées des détecteurs inconnus — jamais confondus', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: { ...BASE_IDEAL, sectorsPriority: ['A', 'B', 'C', 'D'] },
    }
    const result = detectCommercialTensions(context)
    expect(result.contradictions.some(c => c.ruleId === 'tooManySimultaneousMarkets')).toBe(true)
    expect(result.unknowns.length).toBeGreaterThan(0)
    expect(result.contradictions.length + result.unknowns.length).toBeLessThanOrEqual(
      commercialTensionRuleIdValues.length,
    )
  })

  it('rend un tableau VIDE (jamais `null`) quand tout est évalué et rien ne se déclenche', () => {
    const result = detectCommercialTensions(undefined, {
      candidatePool: { total: 0, availableNow: 0 },
      clientNeeds: { total: 0, qualified: 0 },
      candidateSubmissions: { total: 0, withClientEngagement: 0 },
      partners: { total: 0, withEconomics: 0, withFeedback: 0 },
      content: { total: 0, withCommercialUse: 0 },
      rfps: { total: 0, withDecision: 0 },
      missions: { completed: 0, withCapitalisation: 0 },
    })
    expect(Array.isArray(result.contradictions)).toBe(true)
  })
})

/**
 * #2074.12 — « un engagement à faire avancer » ne se déclenchait JAMAIS : aucun
 * producteur ne remplissait `signals`. Le premier producteur réel est le
 * bandeau du vivier (`GET /talents/stats`, déjà lu par l'écran Vivier).
 */
describe('#2074.12 — le vivier réel alimente « un engagement à faire avancer »', () => {
  const stats = (total: number, availableNow: number, availabilityUnknownCount: number) => ({
    total,
    availableNow,
    availabilityUnknownCount,
    enrichedPercent: null,
    refreshedThisWeekPercent: null,
    lastUpdatedAt: null,
  })

  it('aucune statistique lue = aucun signal (jamais un vivier à zéro deviné)', () => {
    expect(commercialTensionSignalsFromTalentStats(undefined)).toEqual({})
    expect(commercialTensionSignalsFromTalentStats(null)).toEqual({})
  })

  it('porte le compte des fiches dont la disponibilité est INCONNUE', () => {
    expect(commercialTensionSignalsFromTalentStats(stats(12, 0, 4)).candidatePool).toEqual({
      total: 12,
      availableNow: 0,
      availabilityUnknown: 4,
    })
  })

  it('vivier entièrement sans affectation enregistrée : « inconnu », jamais « aucun disponible »', () => {
    const outcome = detectPoolWithoutAvailability(undefined, commercialTensionSignalsFromTalentStats(stats(8, 0, 8)))
    expect(outcome.status).toBe('unknown')
  })

  it('déclenche sur la part CONNUE du vivier et nomme la part inconnue', () => {
    const outcome = detectPoolWithoutAvailability(undefined, commercialTensionSignalsFromTalentStats(stats(12, 0, 4)))
    expect(outcome.status).toBe('triggered')
    if (outcome.status !== 'triggered') return
    expect(outcome.contradiction.facts.join(' ')).toContain('4')
    expect(outcome.contradiction.facts.join(' ')).toContain('8')
  })

  it('le mouvement « engagement » sort de detectCommercialTensions quand le signal est relié', () => {
    const { contradictions } = detectCommercialTensions(
      undefined,
      commercialTensionSignalsFromTalentStats(stats(12, 0, 4)),
    )
    expect(auditMovesFrom(contradictions).some(move => move.kind === 'engagement')).toBe(true)
  })

  it('sait dire NON — un profil disponible, aucun mouvement « engagement »', () => {
    const { contradictions } = detectCommercialTensions(
      undefined,
      commercialTensionSignalsFromTalentStats(stats(12, 1, 4)),
    )
    expect(auditMovesFrom(contradictions).some(move => move.kind === 'engagement')).toBe(false)
  })
})

/**
 * #2842 — épopée #2074.13-.19 : deux des sept signaux restants ont en fait
 * déjà un producteur réel, sur le MÊME câblage que #2074.12 (candidatePool) —
 * un endpoint et un hook déjà en production, jamais un comptage backend neuf.
 *
 * `candidateSubmissions` lit `GET /submissions` (`useSubmissions()`, déjà
 * l'écran Positionnements) : `firstFeedbackAt` EST l'engagement client que
 * `detectProfilesWithoutCommitment` réclame — le même fait que l'entonnoir des
 * positionnements compte déjà, jamais un second calcul (GA-26).
 */
describe('#2842.1 — les positionnements réels alimentent « profils sans engagement »', () => {
  const submission = (firstFeedbackAt: string | null, substatus: Submission['substatus'] = null) => ({
    firstFeedbackAt,
    substatus,
  })

  it('aucun positionnement lu (chargement, erreur) = aucun signal, jamais un compte deviné', () => {
    expect(commercialTensionSignalsFromSubmissions(undefined)).toEqual({})
    expect(commercialTensionSignalsFromSubmissions(null)).toEqual({})
  })

  it('lu et vide : un zéro MESURÉ, pas une absence de signal', () => {
    expect(commercialTensionSignalsFromSubmissions([]).candidateSubmissions).toEqual({
      total: 0,
      withClientEngagement: 0,
    })
  })

  it('compte l’engagement client sur `firstFeedbackAt`, jamais sur le statut seul', () => {
    const signals = commercialTensionSignalsFromSubmissions([
      submission('2026-08-01T00:00:00.000Z'),
      submission(null),
      submission(null),
    ])
    expect(signals.candidateSubmissions).toEqual({ total: 3, withClientEngagement: 1 })
  })

  it('le mouvement « engagement » sort de detectCommercialTensions quand aucun retour client n’est tracé', () => {
    const { contradictions } = detectCommercialTensions(
      undefined,
      commercialTensionSignalsFromSubmissions([submission(null), submission(null)]),
    )
    expect(auditMovesFrom(contradictions).some(move => move.kind === 'engagement')).toBe(true)
  })

  it('sait dire NON — au moins un retour client tracé, aucune rupture', () => {
    const outcome = detectProfilesWithoutCommitment(
      undefined,
      commercialTensionSignalsFromSubmissions([submission('2026-08-01T00:00:00.000Z'), submission(null)]),
    )
    expect(outcome.status).toBe('clear')
  })
})

/**
 * `missionRenewals` lit `GET /delivery/renewals` (`useRenewals()`, déjà l'écran
 * de décision `/missions/renouvellements`) : la liste ne porte QUE les
 * missions qui demandent encore une action (`renewalsToAct`) — exactement
 * « éligible à un renouvellement » — et `renewal_status === 'renouvele'` EST
 * signé, jamais une étape parmi d'autres (`RENEWAL_STATUSES`).
 */
describe('#2842.2 — les renouvellements réels alimentent « mission sans renouvellement »', () => {
  it('aucun renouvellement lu (chargement, erreur) = aucun signal', () => {
    expect(commercialTensionSignalsFromRenewals(undefined)).toEqual({})
    expect(commercialTensionSignalsFromRenewals(null)).toEqual({})
  })

  it('lu et vide : un zéro MESURÉ', () => {
    expect(commercialTensionSignalsFromRenewals([]).missionRenewals).toEqual({
      eligibleForRenewal: 0,
      renewed: 0,
    })
  })

  it('compte les missions SIGNÉES (`renouvele`), jamais une étape intermédiaire', () => {
    const signals = commercialTensionSignalsFromRenewals([
      { renewal_status: 'renouvele' },
      { renewal_status: 'discussion_en_cours' },
      { renewal_status: null },
    ])
    expect(signals.missionRenewals).toEqual({ eligibleForRenewal: 3, renewed: 1 })
  })

  it('le mouvement « engagement » sort de detectCommercialTensions quand aucune mission éligible n’est renouvelée', () => {
    const { contradictions } = detectCommercialTensions(
      undefined,
      commercialTensionSignalsFromRenewals([{ renewal_status: 'non_engage' }, { renewal_status: 'bloque' }]),
    )
    expect(auditMovesFrom(contradictions).some(move => move.kind === 'engagement')).toBe(true)
  })

  it('sait dire NON — au moins une mission renouvelée, aucune rupture', () => {
    const outcome = detectMissionWithoutRenewal(
      undefined,
      commercialTensionSignalsFromRenewals([{ renewal_status: 'renouvele' }, { renewal_status: 'non_engage' }]),
    )
    expect(outcome.status).toBe('clear')
  })
})

/**
 * #2842 (reste, 26/09) — épopée #2074.13-.19, tranché sans Louis : `interviews`
 * lit les MÊMES positionnements que #2842.1 (`useSubmissions()`), aucune
 * deuxième requête. `substatus` porte déjà le détail que la règle réclame
 * (`SUBSTATUS_TO_STAGE`, seize valeurs) : `interview_done` = un entretien
 * TENU, `second_interview` = une suite déjà donnée (une deuxième rencontre
 * programmée). Un positionnement déjà tranché (`selected`/`declined`) sort du
 * champ d'observation courant — son substatus ne dit plus « entretien » — donc
 * il ne compte ni pour ni contre : mesuré sur ce qui est observable
 * maintenant, jamais une estimation.
 */
describe('#2842 (reste) — les entretiens réels alimentent « entretien sans suite »', () => {
  const submission = (substatus: Submission['substatus']) => ({ firstFeedbackAt: null, substatus })

  it('aucun positionnement lu = aucun signal interviews', () => {
    expect(commercialTensionSignalsFromSubmissions(undefined).interviews).toBeUndefined()
    expect(commercialTensionSignalsFromSubmissions(null).interviews).toBeUndefined()
  })

  it('lu et vide : un zéro MESURÉ', () => {
    expect(commercialTensionSignalsFromSubmissions([]).interviews).toEqual({ total: 0, withFollowUp: 0 })
  })

  it('compte les entretiens TENUS (`interview_done`/`second_interview`), rien d’autre', () => {
    const signals = commercialTensionSignalsFromSubmissions([
      submission('interview_done'),
      submission('second_interview'),
      submission('interview_to_schedule'),
      submission('selected'),
      submission(null),
    ])
    expect(signals.interviews).toEqual({ total: 2, withFollowUp: 1 })
  })

  it('le mouvement sort de detectCommercialTensions quand aucun entretien tenu n’a de suite', () => {
    const { contradictions } = detectCommercialTensions(
      undefined,
      commercialTensionSignalsFromSubmissions([submission('interview_done'), submission('interview_done')]),
    )
    expect(auditMovesFrom(contradictions).length).toBeGreaterThan(0)
  })

  it('sait dire NON — au moins une suite donnée (second entretien), aucune rupture', () => {
    const outcome = detectInterviewWithoutFollowUp(
      undefined,
      commercialTensionSignalsFromSubmissions([submission('interview_done'), submission('second_interview')]),
    )
    expect(outcome.status).toBe('clear')
  })
})

/**
 * #2842 (reste, 26/09) — `clientNeeds`/`needDetailing`, tranché sans Louis :
 * un comptage backend NEUF (`OpenNeedsService.commercialAuditSignals`,
 * `GET /projects/needs/commercial-audit-signals`), sur `project_needs` — la
 * table que l'écran « Besoins ouverts » lit déjà. « Qualifié » = le statut
 * `qualified` du terrain (`NEED_STATUS_ORDER`, PDF 2 §7.4), jamais un statut
 * en aval deviné. « Réduit à un intitulé » = aucune compétence, aucune
 * séniorité, aucune localisation, aucune date de démarrage — ni contexte, ni
 * contrainte, ni échéance, exactement ce que la règle reproche.
 */
describe('#2842 (reste) — les besoins réels alimentent « besoin sans qualification » et « réduit à un intitulé »', () => {
  it('aucun compteur lu (chargement, erreur) = aucun signal', () => {
    expect(commercialTensionSignalsFromNeeds(undefined)).toEqual({})
    expect(commercialTensionSignalsFromNeeds(null)).toEqual({})
  })

  it('lu : relaie tel quel les deux compteurs, un zéro MESURÉ si le compte est vide', () => {
    const signals = commercialTensionSignalsFromNeeds({
      clientNeeds: { total: 0, qualified: 0 },
      needDetailing: { total: 0, withOnlyATitle: 0 },
    })
    expect(signals.clientNeeds).toEqual({ total: 0, qualified: 0 })
    expect(signals.needDetailing).toEqual({ total: 0, withOnlyATitle: 0 })
  })

  it('sait dire NON — des besoins qualifiés existent, aucune rupture', () => {
    const outcome = detectNeedsWithoutQualification(
      undefined,
      commercialTensionSignalsFromNeeds({
        clientNeeds: { total: 4, qualified: 2 },
        needDetailing: { total: 4, withOnlyATitle: 0 },
      }),
    )
    expect(outcome.status).toBe('clear')
  })

  it('sait dire NON — chaque besoin porte plus qu’un intitulé, aucune rupture', () => {
    const outcome = detectNeedReducedToTitle(
      undefined,
      commercialTensionSignalsFromNeeds({
        clientNeeds: { total: 4, qualified: 2 },
        needDetailing: { total: 4, withOnlyATitle: 0 },
      }),
    )
    expect(outcome.status).toBe('clear')
  })
})

/**
 * #2842 (reste, 26/09) — `contactFollowUps`, tranché sans Louis : un comptage
 * backend NEUF (`ContactsService.getFollowUpStats`,
 * `GET /contacts/follow-up-stats`), sur `contacts.email_sent_at` (« pris » —
 * même fait que `getDeliverability().sent`, GA-26) et `action_plan_items`
 * (une touche de cadence encore ouverte = une date de reprise fixée).
 */
describe('#2842 (reste) — les contacts réels alimentent « contact sans date de reprise »', () => {
  it('aucun compteur lu = aucun signal', () => {
    expect(commercialTensionSignalsFromContactFollowUps(undefined)).toEqual({})
    expect(commercialTensionSignalsFromContactFollowUps(null)).toEqual({})
  })

  it('lu : relaie tel quel le compteur, un zéro MESURÉ si vide', () => {
    expect(commercialTensionSignalsFromContactFollowUps({ total: 0, withNextStepDate: 0 }).contactFollowUps).toEqual({
      total: 0,
      withNextStepDate: 0,
    })
  })

  it('sait dire NON — des contacts pris ont une date de reprise, aucune rupture', () => {
    const outcome = detectContactWithoutFollowUpDate(
      undefined,
      commercialTensionSignalsFromContactFollowUps({ total: 5, withNextStepDate: 3 }),
    )
    expect(outcome.status).toBe('clear')
  })
})
