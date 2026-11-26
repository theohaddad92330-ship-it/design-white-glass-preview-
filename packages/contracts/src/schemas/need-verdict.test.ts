import { describe, expect, it } from 'vitest'
import {
  NEED_VERDICT_AXES,
  NEED_VERDICT_AXIS_WEIGHTS,
  NEED_VERDICTS,
  buildNeedVerdict,
  needAccessAxis,
  needCompetitionAxis,
  needEconomicsAxis,
  needFeasibilityAxis,
  needRelationshipAxis,
  needStaffingCapacityAxis,
  needVerdictResponseSchema,
  needVerdictPriorityQuestion,
  needVerdictSchema,
  type NeedVerdictAxisResult,
} from './need-verdict.js'
import { MIN_AXES_FOR_SCORE } from './mission-scores.js'

/* ------------------------------------------------------------------ */
/* Un jeu d'entrées « tout mesuré, tout au vert » — le point de départ  */
/* de chaque test, qui n'en change qu'UNE chose.                       */
/* ------------------------------------------------------------------ */

function allGreen() {
  return {
    staffingCapacity: { aboveThreshold: 3, threshold: 60, evaluated: 12 },
    economics: { targetRateCents: 65_000, floorRateCents: 60_000 },
    relationship: { activeMissions: 2, accountKnown: true },
    competition: { competitorsOnAccount: 8, panelLooked: true },
    feasibility: { availabilityScore: 100, startOn: '2026-10-01' },
    access: { contactsKnown: 4, decisionMakerKnown: true },
    procurement: { procurementInvolvement: 'non_implique' },
    contractRisk: { riskText: null },
  }
}

describe('les axes du verdict', () => {
  it('en compte HUIT, les six de la maquette puis deux ajouts append-only (#3389)', () => {
    expect([...NEED_VERDICT_AXES]).toEqual([
      'staffing_capacity',
      'economics',
      'relationship',
      'competition',
      'feasibility',
      'access',
      'procurement',
      'contract_risk',
    ])
  })

  it('chaque axe porte un poids NOMMÉ — décisif ou consultatif', () => {
    for (const axis of NEED_VERDICT_AXES) {
      expect(['decisive', 'advisory']).toContain(NEED_VERDICT_AXIS_WEIGHTS[axis])
    }
    // Les deux qui peuvent dire NON : on ne vend personne, et on ne vend pas à perte.
    expect(NEED_VERDICT_AXIS_WEIGHTS.staffing_capacity).toBe('decisive')
    expect(NEED_VERDICT_AXIS_WEIGHTS.economics).toBe('decisive')
  })

  it('trois issues, jamais quatre', () => {
    expect([...NEED_VERDICTS]).toEqual(['go', 'no_go', 'insufficient_data'])
  })
})

/* ------------------------------------------------------------------ */
/* Axe 1 — capacité à staffer                                          */
/* ------------------------------------------------------------------ */

describe('needStaffingCapacityAxis', () => {
  it('rend le compte de profils au-dessus du seuil', () => {
    const axis = needStaffingCapacityAxis({ aboveThreshold: 3, threshold: 60, evaluated: 12 })
    expect(axis.state).toBe('positive')
    expect(axis.measured).toEqual({ count: 3, threshold: 60 })
    expect(axis.unmeasured).toBeNull()
  })

  it('ZÉRO profil au-dessus du seuil BLOQUE — on ne vend personne', () => {
    const axis = needStaffingCapacityAxis({ aboveThreshold: 0, threshold: 60, evaluated: 12 })
    expect(axis.state).toBe('blocking')
    expect(axis.measured).toEqual({ count: 0, threshold: 60 })
  })

  it('un vivier que personne n’a évalué n’est PAS un vivier vide', () => {
    // 0 sur 0 évalué : la question n'a pas été posée. Un « blocking » ici
    // ferait dire « on ne sait pas faire » de ce que personne n'a regardé.
    const axis = needStaffingCapacityAxis({ aboveThreshold: 0, threshold: 60, evaluated: 0 })
    expect(axis.state).toBeNull()
    expect(axis.unmeasured).toBeTruthy()
  })

  it('aucun rapprochement lisible ⇒ non renseigné, jamais zéro', () => {
    const axis = needStaffingCapacityAxis({ aboveThreshold: null, threshold: 60, evaluated: null })
    expect(axis.state).toBeNull()
    expect(axis.measured).toBeNull()
    expect(axis.unmeasured).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ */
/* Axe 2 — économie                                                    */
/* ------------------------------------------------------------------ */

describe('needEconomicsAxis', () => {
  it('cible au-dessus du plancher : la marge est là', () => {
    const axis = needEconomicsAxis({ targetRateCents: 65_000, floorRateCents: 60_000 })
    expect(axis.state).toBe('positive')
    expect(axis.measured).toEqual({ targetRateCents: 65_000, floorRateCents: 60_000 })
  })

  it('cible SOUS le plancher : on vendrait à perte — BLOQUANT', () => {
    expect(needEconomicsAxis({ targetRateCents: 55_000, floorRateCents: 60_000 }).state).toBe('blocking')
  })

  it('cible ÉGALE au plancher : le plancher est acceptable par définition', () => {
    expect(needEconomicsAxis({ targetRateCents: 60_000, floorRateCents: 60_000 }).state).toBe('positive')
  })

  it('un TJM cible absent n’est pas « gratuit » — l’axe n’est pas renseigné', () => {
    const axis = needEconomicsAxis({ targetRateCents: null, floorRateCents: 60_000 })
    expect(axis.state).toBeNull()
    expect(axis.measured).toBeNull()
    expect(axis.unmeasured).toBeTruthy()
  })

  it('sans plancher saisi, rien ne dit que la marge est là', () => {
    expect(needEconomicsAxis({ targetRateCents: 65_000, floorRateCents: null }).state).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* Axe 3 — relation                                                    */
/* ------------------------------------------------------------------ */

describe('needRelationshipAxis', () => {
  it('des missions en cours chez ce compte : la relation existe', () => {
    const axis = needRelationshipAxis({ activeMissions: 2, accountKnown: true })
    expect(axis.state).toBe('positive')
    expect(axis.measured).toEqual({ activeMissions: 2 })
  })

  it('aucune mission en cours est une ATTENTION, jamais un refus', () => {
    // Un logo neuf n'est pas un mauvais besoin — c'est un besoin plus dur.
    const axis = needRelationshipAxis({ activeMissions: 0, accountKnown: true })
    expect(axis.state).toBe('attention')
    expect(axis.measured).toEqual({ activeMissions: 0 })
  })

  it('un besoin sans compte rattaché : rien à mesurer', () => {
    const axis = needRelationshipAxis({ activeMissions: null, accountKnown: false })
    expect(axis.state).toBeNull()
    expect(axis.unmeasured).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ */
/* Axe 4 — concurrence                                                 */
/* ------------------------------------------------------------------ */

describe('needCompetitionAxis', () => {
  it('des fournisseurs en face : ATTENTION, et on dit combien', () => {
    const axis = needCompetitionAxis({ competitorsOnAccount: 8, panelLooked: true })
    expect(axis.state).toBe('attention')
    expect(axis.measured).toEqual({ competitors: 8 })
  })

  it('panel regardé, personne en face : positif', () => {
    expect(needCompetitionAxis({ competitorsOnAccount: 0, panelLooked: true }).state).toBe('positive')
  })

  it('panel JAMAIS regardé ≠ panel vide — l’axe n’est pas renseigné', () => {
    // « on ne sait pas si ce compte est référencé » et « ce compte est ouvert »
    // mènent à deux gestes opposés (`access.ts`).
    const axis = needCompetitionAxis({ competitorsOnAccount: null, panelLooked: false })
    expect(axis.state).toBeNull()
    expect(axis.unmeasured).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ */
/* Axe 5 — faisabilité                                                 */
/* ------------------------------------------------------------------ */

describe('needFeasibilityAxis', () => {
  it('le profil le mieux classé est libre au démarrage : tenable', () => {
    const axis = needFeasibilityAxis({ availabilityScore: 100, startOn: '2026-10-01' })
    expect(axis.state).toBe('positive')
    expect(axis.measured).toEqual({ availabilityScore: 100, startOn: '2026-10-01' })
  })

  it('libre APRÈS le démarrage : ATTENTION, pas un refus', () => {
    // Une date de démarrage se négocie ; elle n'a jamais tué un besoin toute seule.
    expect(needFeasibilityAxis({ availabilityScore: 70, startOn: '2026-10-01' }).state).toBe('attention')
  })

  it('sans date de démarrage, rien à comparer', () => {
    expect(needFeasibilityAxis({ availabilityScore: 100, startOn: null }).state).toBeNull()
  })

  it('⚠️ une disponibilité INCONNUE n’est pas une indisponibilité', () => {
    // L'axe 8 du rapprochement rend `null`, jamais zéro, sur une disponibilité
    // qu'il ne sait pas dériver. Ce `null` traverse jusqu'ici sans devenir
    // « le démarrage n'est pas tenable ».
    const axis = needFeasibilityAxis({ availabilityScore: null, startOn: '2026-10-01' })
    expect(axis.state).toBeNull()
    expect(axis.measured).toBeNull()
    expect(axis.unmeasured).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ */
/* Axe 6 — accès                                                       */
/* ------------------------------------------------------------------ */

describe('needAccessAxis', () => {
  it('un décideur identifié : la porte est connue', () => {
    const axis = needAccessAxis({ contactsKnown: 4, decisionMakerKnown: true })
    expect(axis.state).toBe('positive')
    expect(axis.measured).toEqual({ contacts: 4, decisionMaker: true })
  })

  it('des contacts, aucun décideur : ATTENTION MESURÉE, pas un axe vide', () => {
    // C'est le « rang connu · décideur manquant » de la maquette : on SAIT
    // qu'il manque, ce qui n'est pas la même chose que ne pas savoir.
    const axis = needAccessAxis({ contactsKnown: 4, decisionMakerKnown: false })
    expect(axis.state).toBe('attention')
    expect(axis.measured).toEqual({ contacts: 4, decisionMaker: false })
    expect(axis.unmeasured).toBeNull()
  })

  it('aucun contact du tout : on ne sait pas s’il manque un décideur', () => {
    const axis = needAccessAxis({ contactsKnown: 0, decisionMakerKnown: false })
    expect(axis.state).toBeNull()
    expect(axis.unmeasured).toBeTruthy()
  })

  it('un compte jamais lu : non renseigné', () => {
    expect(needAccessAxis({ contactsKnown: null, decisionMakerKnown: false }).state).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* Le verdict                                                          */
/* ------------------------------------------------------------------ */

describe('#3389.8 — accès organisationnel du compte', () => {
  it('un compte verrouillé rend l’axe ATTENTION même avec un décideur connu, et nomme le verrou', () => {
    const axis = needAccessAxis({ contactsKnown: 4, decisionMakerKnown: true, accessLock: 'verrouille' })
    expect(axis.state).toBe('attention')
    expect(axis.measured).toEqual({ contacts: 4, decisionMaker: true, lock: 'verrouille' })
  })

  it('un compte ouvert garde l’axe positif et porte le verrou', () => {
    const axis = needAccessAxis({ contactsKnown: 4, decisionMakerKnown: true, accessLock: 'ouvert' })
    expect(axis.state).toBe('positive')
    expect(axis.measured).toMatchObject({ lock: 'ouvert' })
  })

  it('verrou inconnu ou absent : rien n’est ajouté (on ne conclut pas d’un silence)', () => {
    for (const accessLock of ['inconnu', null, undefined] as const) {
      const axis = needAccessAxis({ contactsKnown: 4, decisionMakerKnown: true, accessLock })
      expect(axis.state).toBe('positive')
      expect(axis.measured).toEqual({ contacts: 4, decisionMaker: true })
    }
  })

  it('sans contact connu l’axe reste non renseigné, verrou ou pas', () => {
    expect(needAccessAxis({ contactsKnown: 0, decisionMakerKnown: false, accessLock: 'ouvert' }).state).toBeNull()
  })
})

describe('buildNeedVerdict — le dénominateur est AFFICHÉ', () => {
  it('tout au vert ⇒ OUI, FAIS-LE, et les six axes sont rendus', () => {
    const built = buildNeedVerdict(allGreen())
    expect(built.verdict).toBe('go')
    expect(built.axes).toHaveLength(8)
    expect(built.axisCount).toBe(8)
    expect(built.measuredCount).toBe(7)
    expect(built.attentionCount).toBe(1) // la concurrence : 8 fournisseurs
    expect(needVerdictSchema.parse(built)).toEqual(built)
  })

  it('un axe non renseigné SORT du dénominateur — il n’est pas compté négatif', () => {
    const built = buildNeedVerdict({ ...allGreen(), competition: { competitorsOnAccount: null, panelLooked: false } })
    expect(built.axisCount).toBe(8)
    expect(built.measuredCount).toBe(6)
    // Et il ne devient PAS une attention : il n'est ni pour ni contre.
    expect(built.attentionCount).toBe(0)
    expect(built.verdict).toBe('go')
  })

  it('ce qui n’a pas pu être évalué est NOMMÉ', () => {
    const built = buildNeedVerdict({ ...allGreen(), competition: { competitorsOnAccount: null, panelLooked: false } })
    expect(built.unmeasuredAxes).toEqual(['competition', 'contract_risk'])
    const competition = built.axes.find(axis => axis.axis === 'competition') as NeedVerdictAxisResult
    expect(competition.unmeasured).toBeTruthy()
    expect(competition.measured).toBeNull()
  })

  it('un axe DÉCISIF bloquant ⇒ NON, MAUVAIS FIT', () => {
    const built = buildNeedVerdict({
      ...allGreen(),
      staffingCapacity: { aboveThreshold: 0, threshold: 60, evaluated: 9 },
    })
    expect(built.verdict).toBe('no_go')
    expect(built.blockingAxes).toEqual(['staffing_capacity'])
  })

  it('une ATTENTION ne fait JAMAIS basculer en non — elle se dit', () => {
    const built = buildNeedVerdict({
      ...allGreen(),
      relationship: { activeMissions: 0, accountKnown: true },
      access: { contactsKnown: 4, decisionMakerKnown: false },
    })
    expect(built.verdict).toBe('go')
    expect(built.attentionCount).toBe(3)
    expect(built.blockingAxes).toEqual([])
  })

  it('sous trois axes renseignés, il n’y a PAS de verdict', () => {
    const built = buildNeedVerdict({
      staffingCapacity: { aboveThreshold: 3, threshold: 60, evaluated: 12 },
      economics: { targetRateCents: 65_000, floorRateCents: 60_000 },
      relationship: { activeMissions: null, accountKnown: false },
      competition: { competitorsOnAccount: null, panelLooked: false },
      feasibility: { availabilityScore: null, startOn: null },
      access: { contactsKnown: null, decisionMakerKnown: false },
      procurement: { procurementInvolvement: null },
      contractRisk: { riskText: null },
    })
    expect(built.measuredCount).toBe(2)
    expect(built.measuredCount).toBeLessThan(MIN_AXES_FOR_SCORE)
    expect(built.verdict).toBe('insufficient_data')
  })

  it('⚠️ un axe DÉCISIF non renseigné ne devient JAMAIS un « oui »', () => {
    // La règle « un axe non mesuré sort du dénominateur » vaut pour un SCORE.
    // Appliquée à un VERDICT, elle transformerait une ignorance en promesse —
    // c'est le défaut corrigé dans `discoverFamily` (access.ts) après la
    // recette du 22/08. Trois axes consultatifs au vert ne disent pas qu'on
    // sait staffer.
    const built = buildNeedVerdict({
      ...allGreen(),
      staffingCapacity: { aboveThreshold: null, threshold: 60, evaluated: null },
    })
    expect(built.measuredCount).toBe(6)
    expect(built.verdict).toBe('insufficient_data')
    expect(built.unmeasuredDecisiveAxes).toEqual(['staffing_capacity'])
  })

  it('… et un axe décisif non renseigné n’empêche pas un NON venu de l’AUTRE décisif', () => {
    // Savoir qu'on vendrait à perte suffit à répondre non ; ignorer le vivier
    // ne fait pas oublier ce qu'on sait.
    const built = buildNeedVerdict({
      ...allGreen(),
      staffingCapacity: { aboveThreshold: null, threshold: 60, evaluated: null },
      economics: { targetRateCents: 55_000, floorRateCents: 60_000 },
    })
    expect(built.verdict).toBe('no_go')
  })

  it('AUCUNE probabilité, aucun pourcentage de réussite dans la forme rendue', () => {
    const built = buildNeedVerdict(allGreen())
    const keys = new Set(Object.keys(built))
    for (const forbidden of ['score', 'rate', 'chance', 'probability', 'successRate', 'confidence']) {
      expect(`${forbidden} → ${keys.has(forbidden)}`).toBe(`${forbidden} → false`)
    }
    // Ce qui EST rendu : des COMPTES d'axes et des états nommés. Rien qui se
    // lise comme une chance de signer.
    expect(keys).toEqual(
      new Set([
        'verdict',
        'axes',
        'axisCount',
        'measuredCount',
        'attentionCount',
        'unmeasuredAxes',
        'unmeasuredDecisiveAxes',
        'blockingAxes',
      ]),
    )
  })

  it('un axe CONSULTATIF ne peut jamais bloquer — la forme l’interdit', () => {
    // Une relation absente, une concurrence dense, un démarrage tendu, un
    // décideur manquant : quatre attentions, zéro refus.
    const built = buildNeedVerdict({
      ...allGreen(),
      relationship: { activeMissions: 0, accountKnown: true },
      competition: { competitorsOnAccount: 40, panelLooked: true },
      feasibility: { availabilityScore: 20, startOn: '2026-10-01' },
      access: { contactsKnown: 2, decisionMakerKnown: false },
    })
    expect(built.blockingAxes).toEqual([])
    expect(built.verdict).toBe('go')
  })
})

/* ------------------------------------------------------------------ */
/* #2323.33 — la question que Laura pose D'ABORD (décision Louis        */
/* 19/09/2026) : parmi les axes non renseignés, ÉCONOMIE passe devant   */
/* les cinq autres — c'est elle qui décide si l'affaire vaut le coup.   */
/* ------------------------------------------------------------------ */
describe('needVerdictPriorityQuestion — économie d’abord, jamais deviné', () => {
  it('choisit ÉCONOMIE quand elle n’est pas renseignée, même si d’autres axes manquent aussi', () => {
    const built = buildNeedVerdict({
      ...allGreen(),
      economics: { targetRateCents: null, floorRateCents: 60_000 },
      relationship: { activeMissions: null, accountKnown: false },
      access: { contactsKnown: null, decisionMakerKnown: false },
    })
    const question = needVerdictPriorityQuestion(built)
    expect(question?.axis).toBe('economics')
    expect(question?.unmeasured).toBe('noTargetRate')
  })

  it('à défaut, prend le PREMIER axe non renseigné dans l’ordre déclaré — jamais un ordre inventé', () => {
    const built = buildNeedVerdict({
      ...allGreen(),
      // économie renseignée ; staffing_capacity (index 0) ET access (index 5)
      // manquent tous les deux — staffing_capacity vient en premier dans
      // NEED_VERDICT_AXES.
      staffingCapacity: { aboveThreshold: null, threshold: 60, evaluated: null },
      access: { contactsKnown: null, decisionMakerKnown: false },
    })
    const question = needVerdictPriorityQuestion(built)
    expect(question?.axis).toBe('staffing_capacity')
  })

  it('rend null quand les huit axes sont renseignés — rien à demander', () => {
    const built = buildNeedVerdict({ ...allGreen(), contractRisk: { riskText: 'Clause de pénalités' } })
    expect(needVerdictPriorityQuestion(built)).toBeNull()
  })
})

describe('#3389.9/.10 — cadre d’achat et risque contractuel', () => {
  it('achats impliqués ⇒ ATTENTION consultative, jamais un refus', () => {
    const built = buildNeedVerdict({ ...allGreen(), procurement: { procurementInvolvement: 'implique' } })
    expect(built.axes.find(a => a.axis === 'procurement')).toMatchObject({
      state: 'attention',
      weight: 'advisory',
      measured: { procurementInvolved: true },
    })
    expect(built.verdict).toBe('go')
  })

  it('cadre d’achat jamais renseigné ⇒ axe NON RENSEIGNÉ, nommé, jamais « non impliqué »', () => {
    const built = buildNeedVerdict({ ...allGreen(), procurement: { procurementInvolvement: null } })
    const axis = built.axes.find(a => a.axis === 'procurement')
    expect(axis).toMatchObject({ state: null, measured: null, unmeasured: 'noProcurement' })
    expect(built.unmeasuredAxes).toContain('procurement')
  })

  it('un risque déclaré ⇒ ATTENTION, sans jamais recopier le texte dans le contrat', () => {
    const built = buildNeedVerdict({ ...allGreen(), contractRisk: { riskText: 'Clause de pénalités de retard' } })
    const axis = built.axes.find(a => a.axis === 'contract_risk')
    expect(axis).toMatchObject({ state: 'attention', measured: { riskDeclared: true } })
    expect(JSON.stringify(axis)).not.toContain('pénalités')
    expect(needVerdictSchema.parse(built)).toEqual(built)
  })

  it('aucun risque déclaré (ou texte blanc) n’est PAS « aucun risque » : hors décompte', () => {
    for (const riskText of [null, '', '   ']) {
      const axis = buildNeedVerdict({ ...allGreen(), contractRisk: { riskText } }).axes.find(
        a => a.axis === 'contract_risk',
      )
      expect(axis).toMatchObject({ state: null, unmeasured: 'noRiskDeclared' })
    }
  })
})

describe('needVerdictResponseSchema — contexte commercial (#3390.9)', () => {
  const base = {
    verdict: buildNeedVerdict({
      staffingCapacity: { aboveThreshold: 2, threshold: 70, evaluated: 10 },
      economics: { targetRateCents: null, floorRateCents: null },
      relationship: { activeMissions: 0, accountKnown: false },
      competition: { competitorsOnAccount: null, panelLooked: false },
      feasibility: { availabilityScore: null, startOn: null },
      access: { contactsKnown: null, decisionMakerKnown: false },
      procurement: { procurementInvolvement: null },
      contractRisk: { riskText: null },
    }),
    profiles: [],
    runAt: null,
  }

  it('accepte la capacité déclarée et les 5P du compte', () => {
    const parsed = needVerdictResponseSchema.safeParse({
      ...base,
      commercialContext: { weeklyAvailableHours: 12, fiveP: { readiness: 'READY_TO_VERIFY', nextDimension: 'people' } },
    })
    expect(parsed.success).toBe(true)
  })

  it('une absence est `null`, jamais 0 h : 0 heure est refusé', () => {
    expect(
      needVerdictResponseSchema.safeParse({ ...base, commercialContext: { weeklyAvailableHours: null, fiveP: null } })
        .success,
    ).toBe(true)
    expect(
      needVerdictResponseSchema.safeParse({ ...base, commercialContext: { weeklyAvailableHours: 0, fiveP: null } })
        .success,
    ).toBe(false)
  })
})
