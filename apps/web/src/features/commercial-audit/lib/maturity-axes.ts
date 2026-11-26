import type {
  AuditMaturity,
  AuditMaturityAxis,
  AuditMaturityAxisId,
  AuditMaturityLevel,
  AuditSignalsInput,
  ProfileContext,
} from '@bellum/contracts'
import { auditEvaluableAxes, hasFunctionalSpecialization, MINIMUM_SCORE_AXES } from '@bellum/contracts'
import { MAX_SIMULTANEOUS_MARKETS } from './tension-detectors'

/**
 * #2065.1-.18 — le MOTEUR des douze axes de maturité commerciale.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DOCTRINE DU SCORE, APPLIQUÉE ICI LIGNE PAR LIGNE
 * ─────────────────────────────────────────────────────────────────────────
 * - Un score n'est JAMAIS nu : les 13 axes (#2860) sont TOUJOURS rendus, mesurés ou
 *   non — {@link computeCommercialMaturity} ne raccourcit jamais la liste.
 * - Un axe non évaluable SORT du dénominateur : `max` ne compte que les axes
 *   dont `score !== null` (voir `auditEvaluableAxes`, réutilisée telle
 *   quelle — pas une deuxième fois écrite).
 * - Sous 3 axes évalués, pas de score global (`MINIMUM_SCORE_AXES`, la MÊME
 *   constante que le reste du contrat) — les axes restent lisibles quand
 *   même.
 * - Chaque axe porte un NIVEAU nommé ({@link AuditMaturityLevel}), jamais un
 *   score numérique seul : « structuré » se lit sans faire une division.
 * - Aucune confiance n'est un pourcentage : `confidence` reprend les trois
 *   paliers qualitatifs déjà définis pour tout ce contrat.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CINQ AXES RESTENT « INCONNU » AUJOURD'HUI — ET C'EST HONNÊTE
 * ─────────────────────────────────────────────────────────────────────────
 * `proof`, `clientQualification`, `candidateSecurisation`, `capitalisation`
 * et `teamAlignment` mesurent une réalité OPÉRATIONNELLE (preuves déposées,
 * qualification réelle d'un client, sécurisation d'un candidat, capitalisation
 * de mission, alignement d'une ÉQUIPE) qu'aucune source ne relie encore à cet
 * audit — `ProfileContext` est un questionnaire d'ONBOARDING, pas un flux
 * d'activité. Les nommer `unknown` avec un gap explicite est exactement le
 * corollaire du lot (`tension-detectors.ts`) appliqué aux axes : pas de fait
 * à lire, pas de score inventé.
 */

/** #2065.14 — le score par axe reste sur 3 points, une échelle commune aux 7
 *  axes mesurables : le contrat en tire `level` par palier (0/1/2/3).
 *  Exportée pour #2090.10 (`AuditMaturityAxes.tsx`) : le graphique en barres
 *  dimensionne chaque barre sur CETTE échelle, pas une deuxième écrite à côté
 *  (GA-26 — un réglage vit à un seul endroit). */
export const AXIS_MAX_SCORE = 3

type AxisResult = {
  state: AuditMaturityAxis['state']
  score: number | null
  evidence: string[] | null
  gaps: string[] | null
  nextLever: string | null
  confidence: AuditMaturityAxis['confidence']
}

function unknownAxis(gap: string): AxisResult {
  return { state: 'unknown', score: null, evidence: null, gaps: [gap], nextLever: null, confidence: null }
}

function measuredAxis(score: number, evidence: string[], gaps: string[], nextLever: string | null): AxisResult {
  return { state: 'measured', score, evidence, gaps, nextLever, confidence: 'deduced' }
}

function levelFor(score: number | null): AuditMaturityLevel | null {
  if (score === null) return null
  if (score <= 0) return 'notStarted'
  if (score === 1) return 'emerging'
  if (score === 2) return 'structured'
  return 'mature'
}

// #2065.1 — Clarté de l'offre.
function computeOfferClarity(context: ProfileContext | null | undefined): AxisResult {
  const messaging = context?.messagingStyle
  if (!messaging) return unknownAxis('Aucun style de messagerie configuré')
  const angle = messaging.valuePropositionAngle.trim()
  const points = messaging.differentiationPoints.map(p => p.trim()).filter(Boolean)
  const evidence: string[] = []
  const gaps: string[] = []
  let score = 0
  if (angle) {
    score += 1
    evidence.push('Un angle de valeur est formulé')
  } else {
    gaps.push('Aucun angle de valeur formulé')
  }
  if (points.length >= 1) {
    score += 1
    evidence.push(`${points.length} point(s) de différenciation nommé(s)`)
  } else {
    gaps.push('Aucun point de différenciation nommé')
  }
  if (points.length >= 2) {
    score += 1
  } else if (points.length === 1) {
    gaps.push("Un seul point de différenciation — un deuxième renforcerait l'offre")
  }
  const nextLever = gaps[0] ? `Compléter : ${gaps[0].toLowerCase()}` : null
  return measuredAxis(score, evidence, gaps, nextLever)
}

// #2065.3 — Ciblage.
function computeTargeting(context: ProfileContext | null | undefined, answers?: AuditSignalsInput | null): AxisResult {
  const ideal = context?.idealAccountProfile
  if (!ideal) return unknownAxis('Aucun profil de compte idéal établi')
  const sectors = ideal.sectorsPriority.map(s => s.trim()).filter(Boolean)
  const evidence: string[] = []
  const gaps: string[] = []
  let score = 0
  if (sectors.length >= 1) {
    score += 1
    evidence.push(`${sectors.length} secteur(s) prioritaire(s) nommé(s)`)
  } else {
    gaps.push('Aucun secteur prioritaire nommé')
  }
  if (sectors.length > MAX_SIMULTANEOUS_MARKETS && hasFunctionalSpecialization(answers)) {
    // #4422.3 — forfait/conseil sur une seule fonction : plusieurs secteurs ne
    // sont pas une dispersion ; on le dit, on ne retire pas le point.
    score += 1
    evidence.push('Spécialisation fonctionnelle : la diversité de secteurs n’est pas une dispersion')
  } else if (sectors.length > 0 && sectors.length <= MAX_SIMULTANEOUS_MARKETS) {
    score += 1
    evidence.push('Le ciblage reste resserré')
  } else if (sectors.length > MAX_SIMULTANEOUS_MARKETS) {
    gaps.push('Le ciblage se disperse sur trop de secteurs à la fois')
  }
  if (ideal.decisionLevel !== 'operational') {
    score += 1
    evidence.push(`Niveau de décision visé : ${ideal.decisionLevel}`)
  } else {
    gaps.push('Le niveau de décision visé reste opérationnel')
  }
  const nextLever = gaps[0] ? `Compléter : ${gaps[0].toLowerCase()}` : null
  return measuredAxis(score, evidence, gaps, nextLever)
}

// #2065.4 — Accès.
function computeAccess(context: ProfileContext | null | undefined): AxisResult {
  const ideal = context?.idealAccountProfile
  if (!ideal) return unknownAxis('Aucun profil de compte idéal établi')
  const evidence: string[] = []
  const gaps: string[] = []
  let score = 0
  const targetsKeyAccounts = ideal.size === 'grandCompte' || ideal.size === 'all'
  if (!(targetsKeyAccounts && ideal.entryStrategy === 'bottomUp')) {
    score += 1
    evidence.push("La stratégie d'entrée retenue est cohérente avec la taille de compte visée")
  } else {
    gaps.push('Grands comptes visés avec une entrée par le terrain seule')
  }
  if (
    ideal.entryStrategy === 'topDown' ||
    ideal.entryStrategy === 'multiThread' ||
    ideal.entryStrategy === 'referral'
  ) {
    score += 1
    evidence.push(`Stratégie d'entrée nommée : ${ideal.entryStrategy}`)
  } else {
    gaps.push("La stratégie d'entrée retenue ne garantit pas seule un accès décideur")
  }
  if (ideal.decisionLevel === 'cLevel' || ideal.decisionLevel === 'director') {
    score += 1
    evidence.push(`Niveau de décision visé : ${ideal.decisionLevel}`)
  } else {
    gaps.push('Le niveau de décision visé reste en dessous de director')
  }
  const nextLever = gaps[0] ? `Compléter : ${gaps[0].toLowerCase()}` : null
  return measuredAxis(score, evidence, gaps, nextLever)
}

// #2065.5 — Capacité commerciale.
function computeCommercialCapacity(context: ProfileContext | null | undefined): AxisResult {
  const coaching = context?.coachingInsights
  const cadence = coaching?.cadenceRecommendation
  if (!cadence) return unknownAxis('Aucune cadence recommandée calculée')
  const targets = coaching?.kpiTargets
  const evidence: string[] = [`Cadence recommandée : ${cadence.analysesPerWeek} analyses/semaine`]
  const gaps: string[] = []
  let score = 1
  if (targets) {
    score += 1
    evidence.push(`Objectif fixé : ${targets.accountsPerMonth} comptes/mois`)
    const impliedMonthlyCapacity = cadence.analysesPerWeek * 4
    if (targets.accountsPerMonth <= impliedMonthlyCapacity) {
      score += 1
      evidence.push("L'objectif tient dans la capacité impliquée par la cadence")
    } else {
      gaps.push("L'objectif dépasse la capacité impliquée par la cadence recommandée")
    }
  } else {
    gaps.push('Aucun objectif chiffré fixé pour confronter la cadence à une cible')
  }
  const nextLever = gaps[0] ? `Compléter : ${gaps[0].toLowerCase()}` : null
  return measuredAxis(score, evidence, gaps, nextLever)
}

// #2065.6 — Discipline du suivi.
function computeFollowUpDiscipline(context: ProfileContext | null | undefined): AxisResult {
  const cadence = context?.coachingInsights?.cadenceRecommendation
  if (!cadence) return unknownAxis('Aucune cadence recommandée calculée')
  const evidence: string[] = []
  const gaps: string[] = []
  let score = 0
  if (cadence.followUpsPerWeek > 0) {
    score += 1
    evidence.push(`${cadence.followUpsPerWeek} relance(s) recommandée(s) par semaine`)
  } else {
    gaps.push('Aucune relance recommandée')
  }
  if (cadence.followUpsPerWeek >= 5) {
    score += 1
  } else if (cadence.followUpsPerWeek > 0) {
    gaps.push('Le rythme de relance recommandé reste léger')
  }
  if (cadence.messagesPerDay > 0) {
    score += 1
    evidence.push(`${cadence.messagesPerDay} message(s) recommandé(s) par jour`)
  } else {
    gaps.push('Aucun message quotidien recommandé')
  }
  const nextLever = gaps[0] ? `Compléter : ${gaps[0].toLowerCase()}` : null
  return measuredAxis(score, evidence, gaps, nextLever)
}

// #2065.9 — Data et outils.
function computeDataAndTools(context: ProfileContext | null | undefined): AxisResult {
  const parameters = context?.analysisParameters
  if (!parameters) return unknownAxis("Aucun paramètre d'analyse configuré")
  const evidence: string[] = []
  const gaps: string[] = []
  let score = 0
  if (parameters.analysisDepth !== 'light') {
    score += 1
    evidence.push(`Profondeur d'analyse : ${parameters.analysisDepth}`)
  } else {
    gaps.push("La profondeur d'analyse reste légère")
  }
  const focusAreas = parameters.focusAreas.map(a => a.trim()).filter(Boolean)
  if (focusAreas.length > 0) {
    score += 1
    evidence.push(`${focusAreas.length} domaine(s) de focus nommé(s)`)
  } else {
    gaps.push('Aucun domaine de focus nommé')
  }
  if (parameters.contactsTarget >= 20) {
    score += 1
  } else {
    gaps.push('La cible de contacts par analyse reste modeste')
  }
  const nextLever = gaps[0] ? `Compléter : ${gaps[0].toLowerCase()}` : null
  return measuredAxis(score, evidence, gaps, nextLever)
}

// #2065.10 — Mesure.
function computeMeasurement(context: ProfileContext | null | undefined): AxisResult {
  const targets = context?.coachingInsights?.kpiTargets
  if (!targets) return unknownAxis('Aucun objectif chiffré (kpiTargets) fixé pour mesurer l’activité')
  const evidence: string[] = []
  const gaps: string[] = []
  let score = 0
  if (targets.accountsPerMonth > 0) {
    score += 1
    evidence.push(`Objectif de comptes/mois : ${targets.accountsPerMonth}`)
  } else {
    gaps.push('Aucun objectif de comptes par mois')
  }
  if (targets.rdvPerMonth > 0) {
    score += 1
    evidence.push(`Objectif de RDV/mois : ${targets.rdvPerMonth}`)
  } else {
    gaps.push('Aucun objectif de RDV par mois')
  }
  if (targets.conversionRateTarget.trim().length > 0) {
    score += 1
    evidence.push(`Taux de conversion visé : ${targets.conversionRateTarget}`)
  } else {
    gaps.push('Aucun taux de conversion visé nommé')
  }
  const nextLever = gaps[0] ? `Compléter : ${gaps[0].toLowerCase()}` : null
  return measuredAxis(score, evidence, gaps, nextLever)
}

/** Les 5 axes structurellement non mesurables aujourd'hui — voir le docblock
 *  de tête. Une fonction par axe, même si le corps est identique : chacune
 *  porte SON gap nommé, et un futur lot qui branche une source remplace
 *  UNIQUEMENT la sienne, jamais les cinq d'un coup. */
function computeProof(): AxisResult {
  return unknownAxis('Aucune preuve commerciale (étude de cas, référence) enregistrée')
}
function computeClientQualification(): AxisResult {
  return unknownAxis('Aucune donnée de qualification client mesurée')
}
function computeCandidateSecurisation(): AxisResult {
  return unknownAxis('Aucune donnée de sécurisation candidat mesurée')
}
function computeCapitalisationAxis(): AxisResult {
  return unknownAxis('Aucune capitalisation de mission reliée à cet audit')
}
function computeTeamAlignment(): AxisResult {
  return unknownAxis("Aucune donnée d'équipe mesurée — le profil décrit une activité, pas une équipe")
}

// #2860 (#2045.12-.14) — Réseau : DÉCLARÉ à l'onboarding
// (`reseau-comptage.ts`), jamais déduit par un modèle — même patron que
// `commercial-audit-signals.ts` (AuditSignalsInput, « déclaré, pas déduit »).
// Aucun prompt IA, aucune calibration : les cinq bandes sont VERBATIM.
const NETWORK_DOOR_FIELDS = [
  'former_clients_count_band',
  'former_colleagues_count_band',
  'partners_count_band',
  'referrers_count_band',
] as const satisfies readonly (keyof AuditSignalsInput)[]

function isNonZeroBand(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value !== '0'
}

function computeNetwork(answers: AuditSignalsInput | null | undefined): AxisResult {
  const declaredDoors = NETWORK_DOOR_FIELDS.filter(field => typeof answers?.[field] === 'string')
  if (declaredDoors.length === 0) return unknownAxis('Aucune bande de réseau personnel déclarée à l’onboarding')

  const evidence: string[] = []
  const gaps: string[] = []
  let score = 0

  // #2045.12 — réseau existant : au moins une porte déclarée non vide.
  const existingDoors = declaredDoors.filter(field => isNonZeroBand(answers?.[field]))
  if (existingDoors.length > 0) {
    score += 1
    evidence.push(`${existingDoors.length} porte(s) de réseau personnel déclarée(s) non vide(s)`)
  } else {
    gaps.push('Aucune porte de réseau personnel déclarée non vide')
  }

  // #2045.14 — portes à requalifier : une porte jamais répondue.
  const undeclaredDoors = NETWORK_DOOR_FIELDS.filter(field => typeof answers?.[field] !== 'string')
  if (undeclaredDoors.length === 0 && existingDoors.length >= 2) {
    score += 1
    evidence.push('Les quatre portes du réseau personnel sont renseignées')
  } else if (undeclaredDoors.length > 0) {
    gaps.push(`${undeclaredDoors.length} porte(s) de réseau personnel jamais renseignée(s) — à requalifier`)
  }

  // #2045.13 — réseau exploitable, distinct du réseau simplement existant :
  // les relations jugées CHAUDES, transversales aux quatre portes.
  if (isNonZeroBand(answers?.warm_relations_count_band)) {
    score += 1
    evidence.push(`Relations chaudes déclarées : ${answers?.warm_relations_count_band}`)
  } else if (typeof answers?.warm_relations_count_band === 'string') {
    gaps.push('Aucune relation chaude déclarée — réseau existant mais dormant')
  } else {
    gaps.push('Relations chaudes non renseignées')
  }

  const nextLever = gaps[0] ? `Compléter : ${gaps[0].toLowerCase()}` : null
  return measuredAxis(score, evidence, gaps, nextLever)
}

const AXIS_COMPUTERS: Record<
  AuditMaturityAxisId,
  (context: ProfileContext | null | undefined, answers: AuditSignalsInput | null | undefined) => AxisResult
> = {
  offerClarity: context => computeOfferClarity(context),
  proof: () => computeProof(),
  targeting: (context, answers) => computeTargeting(context, answers),
  access: context => computeAccess(context),
  commercialCapacity: context => computeCommercialCapacity(context),
  followUpDiscipline: context => computeFollowUpDiscipline(context),
  clientQualification: () => computeClientQualification(),
  candidateSecurisation: () => computeCandidateSecurisation(),
  dataAndTools: context => computeDataAndTools(context),
  measurement: context => computeMeasurement(context),
  capitalisation: () => computeCapitalisationAxis(),
  teamAlignment: () => computeTeamAlignment(),
  network: (_context, answers) => computeNetwork(answers),
}

/** #2065.1-.12 — le libellé FRANÇAIS de chaque axe. Catalogue fermé, de la
 *  même nature que les autres vocabulaires fermés de ce contrat
 *  (`auditProductAreaValues`…) ; la version i18n FR+EN vit en PARALLÈLE dans
 *  `commercialAudit.json` (`maturity.axis.<id>.label`) pour un écran qui
 *  voudrait localiser par identité plutôt que faire confiance à ce texte. */
const AXIS_LABELS: Record<AuditMaturityAxisId, string> = {
  offerClarity: "Clarté de l'offre",
  proof: 'Preuves',
  targeting: 'Ciblage',
  access: 'Accès',
  commercialCapacity: 'Capacité commerciale',
  followUpDiscipline: 'Discipline du suivi',
  clientQualification: 'Qualification client',
  candidateSecurisation: 'Sécurisation candidat',
  dataAndTools: 'Data et outils',
  measurement: 'Mesure',
  capitalisation: 'Capitalisation',
  teamAlignment: 'Alignement équipe',
  network: 'Réseau',
}

/**
 * L'AGRÉGATEUR — l'APPELANT est `buildCommercialAuditContext`
 * (`build-audit.ts`). Toujours les 13 axes (#2860), jamais une liste raccourcie.
 */
export function computeCommercialMaturity(
  context: ProfileContext | null | undefined,
  answers?: AuditSignalsInput | null,
): AuditMaturity {
  const axes: AuditMaturityAxis[] = (Object.keys(AXIS_COMPUTERS) as AuditMaturityAxisId[]).map(id => {
    const result = AXIS_COMPUTERS[id](context, answers)
    return {
      id,
      label: AXIS_LABELS[id],
      state: result.state,
      score: result.score,
      level: levelFor(result.score),
      evidence: result.evidence,
      gaps: result.gaps,
      nextLever: result.nextLever,
      confidence: result.confidence,
    }
  })

  const evaluated = auditEvaluableAxes(axes)
  if (evaluated < MINIMUM_SCORE_AXES) {
    return {
      score: null,
      max: Math.max(evaluated, 1) * AXIS_MAX_SCORE,
      axes,
      reason: `moins de ${MINIMUM_SCORE_AXES} axes évalués — sous ce seuil, un score global mesurerait la complétude de nos données, pas la maturité de l'activité`,
    }
  }

  const score = axes.reduce((sum, axis) => sum + (axis.score ?? 0), 0)
  return {
    score,
    max: evaluated * AXIS_MAX_SCORE,
    axes,
    reason: null,
  }
}
