import {
  EXCLUSION_SEVERITY,
  MATCH_AXIS_WEIGHTS,
  MATCH_DEFAULT_THRESHOLD,
  normaliseMatchWeights,
  type ExclusionReason,
  type MatchAxis,
  type MatchAxisResult,
  type MatchBucket,
  type MatchCandidate,
  type MatchExclusion,
  type MatchFlag,
  type MatchNeed,
  type MatchResult,
  type MatchSkill,
  type MatchWeights,
} from '@bellum/contracts'
import {
  axisAvailability,
  axisClientConstraints,
  axisClientHistory,
  axisComparableExperience,
  axisContract,
  axisEnvironment,
  axisEvidenceQuality,
  axisLanguage,
  axisLocation,
  axisMustHave,
  axisNiceToHave,
  axisRate,
  axisRisks,
  axisSector,
  axisSeniority,
  AXIS_ORDER,
  missingClearances,
  resolveSkills,
  type AxisOutcome,
} from './axes'
import { availabilityIsStale, clientHistoryScore, pushableScore } from './pushable'

/**
 * L'assemblage des treize axes en un résultat (PDF 4 §3 et §4).
 *
 * Ce fichier ne calcule aucun axe : il les ordonne, normalise leur poids, en tire
 * les deux scores, les motifs d'exclusion et les questions à poser. Séparer les
 * deux n'est pas une coquetterie — les axes sont testables un par un, et c'est
 * ici seulement qu'un bug mélangerait deux scores qui ne doivent jamais se
 * mélanger.
 *
 * Il ne reçoit ni nom, ni photo, ni date de naissance, ni adresse : la garde
 * GA-06 le vérifie, et `MatchCandidate` le rend impossible.
 */

type EvaluateOptions = {
  weights?: Partial<Record<MatchAxis, number>>
  threshold?: number
  canReadFinance?: boolean
  now?: Date
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function evaluateCandidate(
  need: MatchNeed,
  candidate: MatchCandidate,
  options: EvaluateOptions = {},
): MatchResult {
  const now = options.now ?? new Date()
  const weights = normaliseMatchWeights(options.weights ?? MATCH_AXIS_WEIGHTS)
  const threshold = options.threshold ?? MATCH_DEFAULT_THRESHOLD
  const canReadFinance = options.canReadFinance ?? false
  const day = today(now)

  const skills = resolveSkills(need, candidate)

  const outcomes: Record<MatchAxis, AxisOutcome> = {
    must_have: axisMustHave(skills),
    nice_to_have: axisNiceToHave(skills),
    seniority: axisSeniority(need, candidate),
    sector: axisSector(need, candidate),
    environment: axisEnvironment(need, candidate),
    language: axisLanguage(need, candidate),
    location: axisLocation(need, candidate),
    availability: axisAvailability(need, candidate, day),
    contract_status: axisContract(need, candidate),
    rate: axisRate(need, candidate, canReadFinance),
    evidence_quality: axisEvidenceQuality(skills),
    client_constraints: axisClientConstraints(need, candidate),
    risks: axisRisks(candidate, now),
    // #4072.6
    client_history: axisClientHistory(need, now),
    // #2176.13 — visible, poids 0 (forcé par normaliseMatchWeights).
    comparable_experience: axisComparableExperience(skills, candidate),
  }

  const axes: MatchAxisResult[] = AXIS_ORDER.map(axis => ({
    axis,
    score: outcomes[axis].score,
    weight: weights[axis],
    detail: outcomes[axis].detail,
    evidence: outcomes[axis].evidence,
  }))

  const correspondenceScore = weightedScore(axes)
  const exclusions = collectExclusions(need, candidate, skills, outcomes)
  const flags = collectFlags(candidate, now)

  const pushable = pushableScore(
    {
      correspondence: correspondenceScore,
      availability: outcomes.availability.score,
      rateFit: outcomes.rate.score,
      clientHistory: clientHistoryScore(candidate.clientHistoryFlag, candidate.clientHistoryRecoverable),
      evidenceQuality: outcomes.evidence_quality.score,
    },
    {
      consentExpired: candidate.consentState === 'expired',
      previouslyRejected: candidate.clientHistoryFlag === 'rejected' && !candidate.clientHistoryRecoverable,
      alreadyOnMissionAtClient: candidate.onMissionAtClient,
      availabilityStale: availabilityIsStale(candidate.availabilityCheckedAt, now),
    },
  )

  const bucket = classify({
    exclusions,
    correspondenceScore,
    pushable,
    threshold,
    availabilityUnknown: outcomes.availability.score === null,
    noSkills: candidate.skills.length === 0,
  })

  return {
    consultantId: candidate.consultantId,
    axes,
    correspondenceScore,
    pushableScore: pushable,
    bucket,
    exclusions,
    skills,
    gaps: collectGaps(skills, outcomes),
    adjacency: skills
      .filter(skill => skill.status === 'adjacent')
      .map(skill => `${skill.label} présent, ${skill.term} demandé`),
    questionsToValidate: collectQuestions(need, candidate, skills, outcomes),
    flags,
    // #2176.3 — pass-through, jamais recalculé : cette preuve ne pèse dans
    // aucun axe.
    targetedCvVersion: candidate.targetedCvVersion,
  }
}

/**
 * La correspondance, sur les seuls axes ÉVALUABLES.
 *
 * Un axe `null` sort du dénominateur. Sans cela, un besoin qui ne précise ni
 * langue, ni habilitation, ni environnement plafonnerait tout le vivier à 70 —
 * et ce 70 mesurerait la qualité de la saisie du besoin, pas celle des profils.
 */
export function weightedScore(axes: readonly MatchAxisResult[]): number {
  let points = 0
  let denominator = 0
  for (const axis of axes) {
    if (axis.score === null) continue
    points += axis.score * axis.weight
    denominator += axis.weight
  }
  if (denominator === 0) return 0
  return Math.round(points / denominator)
}

function push(list: MatchExclusion[], reason: ExclusionReason, detail: string): void {
  list.push({ reason, severity: EXCLUSION_SEVERITY[reason], detail })
}

function collectExclusions(
  need: MatchNeed,
  candidate: MatchCandidate,
  skills: MatchSkill[],
  outcomes: Record<MatchAxis, AxisOutcome>,
): MatchExclusion[] {
  const exclusions: MatchExclusion[] = []

  if (candidate.skills.length === 0) {
    push(exclusions, 'no_skills_recorded', 'aucune compétence saisie sur ce profil')
  }
  if (candidate.consentState === 'expired') {
    push(exclusions, 'consent_expired', 'consentement expiré — à renouveler avant toute proposition')
  }
  const missingRequired = skills.filter(skill => skill.required && skill.status !== 'matched')
  if (missingRequired.length > 0) {
    push(
      exclusions,
      'missing_required_skill',
      `compétence obligatoire absente : ${missingRequired.map(skill => skill.term).join(', ')}`,
    )
  }
  // « Occupé à la date de démarrage » — pas seulement « occupé sans fin ».
  // Un profil libre le 1er décembre pour un démarrage le 15 septembre EST
  // indisponible au démarrage : c'est le §5.2 N14, qui veut le voir passer en
  // « limites » avec ce motif plutôt que d'être recommandé.
  if (outcomes.availability.score !== null && outcomes.availability.score < 100) {
    push(exclusions, 'unavailable_at_start', outcomes.availability.detail)
  }
  if (outcomes.location.score === 0) {
    push(exclusions, 'out_of_zone', outcomes.location.detail)
  }
  // Un écart d'un cran de langue se dit ; deux crans, ou une langue absente,
  // empêchent de travailler. Bloquer sur un cran écarterait des profils que le
  // client aurait acceptés.
  if (outcomes.language.score !== null && outcomes.language.score < 50) {
    push(exclusions, 'language_mismatch', outcomes.language.detail)
  }
  // ⚠️ Le manque se RECALCULE, il ne se relit pas dans la phrase de l'axe. La
  // version précédente faisait `outcomes.client_constraints.detail.includes(...)`
  // — or cette phrase porte aussi le motif du refus client, si bien qu'un refus
  // « habilitation Secret jugée trop courte » fabriquait un `clearance_missing`
  // sur un profil qui DÉTIENT l'habilitation Secret.
  const missingClearance = missingClearances(need, candidate)
  if (missingClearance.length > 0) {
    push(exclusions, 'clearance_missing', `habilitation requise non détenue : ${missingClearance.join(', ')}`)
  }
  if (outcomes.contract_status.score === 0) {
    push(exclusions, 'contract_mismatch', outcomes.contract_status.detail)
  }
  if (outcomes.rate.score !== null && outcomes.rate.score <= 15) {
    push(exclusions, 'rate_out_of_range', outcomes.rate.detail)
  }
  if (candidate.clientHistoryFlag === 'rejected') {
    push(
      exclusions,
      'previously_rejected_by_client',
      candidate.clientHistoryReason
        ? `déjà refusé chez ce client (${candidate.clientHistoryReason})`
        : 'déjà refusé chez ce client',
    )
  }
  if (candidate.onMissionAtClient) {
    push(exclusions, 'already_on_mission_at_client', 'déjà en mission chez ce client — débauchage interne')
  }
  return exclusions
}

/**
 * Le bloc d'un profil (§4).
 *
 * L'ordre des questions n'est pas indifférent. « Je ne sais pas » passe AVANT
 * « non » : un profil dont la disponibilité est inconnue va dans « non
 * évaluables », jamais dans « écartés ». C'est la règle que le PDF appelle la
 * plus importante du module, et c'est celle qui empêche un vivier mal renseigné
 * de disparaître silencieusement.
 *
 * Ensuite seulement, un empêchement bloquant sépare « écartés » de « limites » :
 * un profil dont la correspondance reste bonne malgré son blocage est montré
 * avec son écart NOMMÉ, parce que le recruteur peut lever un blocage (décaler un
 * démarrage, négocier une zone) qu'un algorithme ne peut pas.
 */
export function classify(input: {
  exclusions: readonly MatchExclusion[]
  correspondenceScore: number
  pushable: number
  threshold: number
  availabilityUnknown: boolean
  noSkills: boolean
}): MatchBucket {
  if (input.noSkills || input.availabilityUnknown) return 'not_evaluable'
  const blocking = input.exclusions.some(exclusion => exclusion.severity === 'blocking')
  if (blocking) return input.correspondenceScore >= input.threshold ? 'borderline' : 'excluded'
  return input.pushable >= input.threshold ? 'recommended' : 'borderline'
}

/**
 * Ce qui MANQUE, dit en une phrase par manque.
 *
 * Repris mot pour mot par le dossier de compétences (§12) sous « ce que je n'ai
 * pas pu dire ». Le reformuler entre les deux écrans ferait diverger ce qu'on
 * annonce en interne et ce qu'on écrit au client.
 */
function collectGaps(skills: MatchSkill[], outcomes: Record<MatchAxis, AxisOutcome>): string[] {
  const gaps: string[] = []
  for (const skill of skills) {
    if (skill.status === 'matched') continue
    const qualifier = skill.required ? 'obligatoire' : 'souhaitée'
    gaps.push(
      skill.status === 'adjacent'
        ? `${skill.term} (${qualifier}) — non prouvé, ${skill.label} en approche`
        : `${skill.term} (${qualifier}) — non prouvé`,
    )
  }
  if (outcomes.sector.score === 0) gaps.push(outcomes.sector.detail)
  if (outcomes.language.score !== null && outcomes.language.score < 100) gaps.push(outcomes.language.detail)
  return gaps
}

/**
 * La trame de l'appel de qualification (§4.2).
 *
 * « Elles ne sont pas décoratives » : chaque question naît d'un écart réel, et
 * une fiche sans écart ne produit aucune question — plutôt qu'une liste polie
 * que personne ne poserait.
 */
function collectQuestions(
  need: MatchNeed,
  candidate: MatchCandidate,
  skills: MatchSkill[],
  outcomes: Record<MatchAxis, AxisOutcome>,
): string[] {
  const questions: string[] = []
  for (const skill of skills) {
    if (skill.status === 'matched' && skill.levelUnknown) questions.push(`niveau réel sur ${skill.label}`)
    if (skill.status === 'adjacent')
      questions.push(`${skill.label} plutôt que ${skill.term} : montée en charge possible ?`)
  }
  if (outcomes.rate.score !== null && outcomes.rate.score < 100) questions.push('souplesse sur le TJM')
  if (outcomes.sector.score === 0 && need.accountSector) questions.push(`intérêt pour le secteur ${need.accountSector}`)
  if (outcomes.availability.evidence.some(item => item.source === 'declared')) {
    questions.push('confirmer la disponibilité annoncée')
  }
  for (const warning of candidate.preferenceWarnings) questions.push(warning)
  return questions
}

function collectFlags(candidate: MatchCandidate, now: Date): MatchFlag[] {
  const flags: MatchFlag[] = []
  if (candidate.clientHistoryFlag === 'rejected') {
    flags.push({
      kind: 'previously_rejected_by_client',
      detail: candidate.clientHistoryRecoverable
        ? 'refus antérieur sur le prix ou le calendrier — repositionnable'
        : 'refus antérieur chez ce client',
      // La DATE voyage jusqu'à la carte. Sans elle, « déjà refusé » se lit comme
      // un refus d'hier — et c'est cette lecture qui fait renoncer à reproposer
      // quelqu'un refusé il y a trois ans. Le panneau du vivier l'affichait
      // déjà ; le tiroir du besoin, l'écran où l'on rapproche, ne l'avait pas.
      // `null` quand le passage est encore ouvert : on n'en invente pas une.
      at: candidate.clientHistoryAt,
    })
  }
  if (candidate.onMissionAtClient) {
    flags.push({ kind: 'already_on_mission_at_client', detail: 'déjà en mission chez ce client' })
  }
  if (candidate.activeSubmissionsElsewhere > 0) {
    flags.push({
      kind: 'active_submission_elsewhere',
      detail: `${candidate.activeSubmissionsElsewhere} positionnement(s) en cours ailleurs`,
    })
  }
  if (availabilityIsStale(candidate.availabilityCheckedAt, now)) {
    flags.push({ kind: 'availability_not_revalidated', detail: 'disponibilité non revalidée depuis plus de 60 jours' })
  }
  if (candidate.consentState === 'expiring') {
    flags.push({ kind: 'consent_expiring', detail: 'consentement bientôt échu' })
  }
  if (candidate.consentState === 'none') {
    flags.push({ kind: 'consent_missing', detail: 'aucun consentement recueilli' })
  }
  for (const warning of candidate.preferenceWarnings) {
    flags.push({ kind: 'preference_warning', detail: warning })
  }
  return flags
}

/**
 * Le classement complet, meilleur d'abord.
 *
 * À score égal l'ordre est stable sur l'identifiant — pas sur le nom, que ce
 * moteur ne connaît pas. Deux exécutions identiques rendent la même liste ;
 * sans cela, « pourquoi ce profil ? » n'a pas de réponse reproductible, et
 * l'AI Act en demande une.
 */
export function rankMatches(
  need: MatchNeed,
  candidates: readonly MatchCandidate[],
  options: EvaluateOptions = {},
): MatchResult[] {
  return candidates
    .map(candidate => evaluateCandidate(need, candidate, options))
    .sort(
      (a, b) =>
        b.pushableScore - a.pushableScore ||
        b.correspondenceScore - a.correspondenceScore ||
        a.consultantId.localeCompare(b.consultantId),
    )
}

/** Les poids réellement employés — exposés pour être FIGÉS dans le journal. */
export function resolveWeights(weights?: Partial<Record<MatchAxis, number>>): MatchWeights {
  return normaliseMatchWeights(weights ?? MATCH_AXIS_WEIGHTS)
}
