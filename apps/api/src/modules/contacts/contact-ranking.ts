import {
  CONTACT_RANKING_AXES,
  CONTACT_RANKING_TIE_BREAKER_AXES,
  CONTACT_STRATEGIC_AXES,
  MIN_RANKING_AXES_FOR_SCORE,
  RECOMMENDED_PATH_MAX,
  angleThemeTokens,
  computeAngleMatchFromTokens,
  computeHierarchyLevel,
  type ContactAccessPath,
  type ContactAntiAdvice,
  type ContactAntiAdviceWhat,
  type ContactExplanation,
  type ContactExplanationDimension,
  type ContactExplanationReason,
  type ContactGroupKey,
  type ContactOrderReason,
  type ContactRankingAxis,
  type ContactRankingAxisKey,
  type ContactRankingConfidence,
  type ContactRankingReason,
  type ContactRankingResponse,
  type EsnTargetLevel,
  type HierarchyLevel,
  type RankedContact,
  type StrategicAxis,
} from '@bellum/contracts'
import { buildEntityScoreContext, lookupEntityZone } from '../analysis/contact-score'
import { matchTargetLevel, type PreparedTargetPersonas } from './target-persona-match'

/**
 * #2120.30-38 — NOYAU du classement des contacts d'un compte.
 *
 * Geste empêché : comprendre POURQUOI une personne est en tête du chemin
 * recommandé. Le rang affiché était `contact.priority`, un entier 1-5 posé par
 * le prompt de génération et figé ensuite — ni le périmètre, ni le sujet, ni
 * l'offre que le commercial choisit ne pouvaient le faire bouger, et aucune
 * raison ne l'accompagnait. « Afficher le rang » tant que le calcul restait
 * côté IA aurait été un trompe-l'œil : c'est donc le CALCUL qui est ici.
 *
 * Neuf axes nommés ({@link CONTACT_RANKING_AXES}), et la règle de la grille
 * /100 du dépôt (`computeContactScore`) sur l'absence :
 *  - une absence qui est un FAIT SUR LA LIGNE (aucun rôle, aucun échange) est
 *    un zéro collecté ;
 *  - une absence qui est un TROU DE CONNAISSANCE (aucune cartographie, aucun
 *    sujet ni offre choisis, coordonnées jamais recherchées) sort du
 *    dénominateur, avec sa raison.
 *
 * #2120.27-29 — aucun axe ne récompense le prestige SEUL : le niveau utile est
 * celui d'une direction ou d'un management (porte d'entrée), un comité exécutif
 * de groupe n'y gagne presque rien, et la séniorité ne compte que quand
 * l'intitulé touche le sujet ou l'offre.
 *
 * ⚠️ c58 / GA-06 — ce fichier est un noyau surveillé : il ne reçoit ni
 * l'identité, ni la photo, ni le domicile, ni la ville de la personne. La ligne
 * {@link RankableContactRow} ne les déclare pas, et `protected-criteria.spec.ts`
 * fait rougir la CI si l'un de ces champs y est nommé.
 */

export type RankableContactRow = {
  id: string
  title: string | null
  entity: string | null
  decision_role: string | null
  email: string | null
  email_verified: boolean | null
  phone: string | null
  linkedin_url: string | null
  source: string | null
  user_status: string | null
  email_sent_at: Date | string | null
  last_enrichment_at: Date | string | null
  priority: number | null
  /**
   * #2295.4bis — décision Louis 18/09/2026 (question 24, née de #2295.4) : un
   * fait de SEMIS ("ce contact est UTILISABLE EN DÉMONSTRATION"), jamais une
   * adresse vérifiée. Distinct d'{@link email_verified} par construction — le
   * nom ne dit rien sur une adresse réelle. `true` UNIQUEMENT sur les lignes
   * posées par le jeu de données de démonstration (`demo-dataset.ts` →
   * `DemoSeedService.demoContactRow`) ; jamais ailleurs (garde de frontière,
   * `apps/api/src/architecture/demo-seed-first-door-is-demo-only.spec.ts`).
   */
  demo_seed_first_door: boolean | null
}

export type ContactRankingParams = {
  perimeter?: string | null
  subject?: string | null
  offer?: string | null
  /**
   * Lot 758 (CONTACTS 4/6) — les mots de l'offre DÉCLARÉE de l'ESN (`profileOfferTokens`).
   * Lus seulement quand aucune offre n'est CHOISIE : l'offre choisie gagne toujours. Avant,
   * l'axe `offer` restait « aucune offre choisie » sur tout le parc, et pour une ESN data la
   * joignabilité départageait seule un Head of Data et un chef de l'architecture (Julien) :
   * la porte d'entrée tombait sur l'architecte. Absent ou vide : l'ordre d'avant.
   */
  profileOfferTokens?: ReadonlySet<string>
}

type Zone = { relevance?: string; perimeterTier?: string }

type RankingContext = {
  zones: Map<string, Zone>
  chosenZone: Map<string, Zone> | null
  subjectTokens: Set<string>
  offerTokens: Set<string>
}

const CHOSEN_TIER = 'CHOSEN'

const AXIS_MAX = Object.fromEntries(CONTACT_RANKING_AXES.map(a => [a.key, a.max])) as Record<
  ContactRankingAxisKey,
  number
>

/** Le pouvoir d'achat que porte un rôle (taxonomie MEDDIC du contrat). */
const ROLE_POWER: Record<string, number> = {
  economic: 10,
  sponsor: 8,
  champion: 8,
  // #4292.10 (Louis 21/10, Veolia : dix « Référent technique », aucun décideur) — le technique passe SOUS le sponsor et
  // le champion : il ne signe pas, il éclaire.
  technical: 7,
  user: 6,
  influencer: 6,
  operational: 5,
  procurement: 4,
  purchasing: 4,
  blocker: 2,
}

/**
 * #2120.31 — l'UTILITÉ d'un niveau comme porte d'entrée, pas son rang. Une
 * direction ou un management (N-1 / N-2) ouvre le compte ; un comité exécutif de
 * groupe arbitre en dernier, il ne se contacte pas en premier (`bellum_contacts.py`
 * le dit déjà à la génération : « commencer par les N-2 accessibles »).
 */
const LEVEL_USEFULNESS: Record<HierarchyLevel, number> = {
  governance: 0,
  c_level: 1,
  direction: 5,
  management: 5,
  expert: 3,
  operationnel: 2,
  achats: 3,
  unknown: 0,
}

const LEVEL_REASON: Record<HierarchyLevel, ContactRankingReason> = {
  governance: 'level_governance',
  c_level: 'level_c_level',
  direction: 'level_direction',
  management: 'level_management',
  expert: 'level_expert',
  operationnel: 'level_operational',
  achats: 'level_purchasing',
  unknown: 'level_unknown',
}

/** #2120.37 — ce que l'ESPACE a lui-même apporté : saisie, reprise, CRM connecté. */
const RELATIONSHIP_SOURCES = new Set(['crm', 'manual', 'import'])
const PURCHASING_ROLES = new Set(['procurement', 'purchasing'])

/** #2295.2 — les rôles MEDDIC qui font un champion (sponsor interne inclus). */
const CHAMPION_ROLES = new Set(['champion', 'sponsor'])

/** #2295.2 — les paliers qui portent le pouvoir de DÉCIDER, pas seulement d'influencer. */
const DECISION_POWER_LEVELS = new Set<HierarchyLevel>(['governance', 'c_level', 'direction', 'management'])

function axis(key: ContactRankingAxisKey, points: number | null, reason: ContactRankingReason): ContactRankingAxis {
  return { key, points, max: AXIS_MAX[key], reason }
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function perimeterAxis(entity: string | null, ctx: RankingContext): ContactRankingAxis {
  // #2120.30 — le périmètre CHOISI prime sur la cartographie du compte.
  if (ctx.chosenZone) {
    if (!hasText(entity)) return axis('perimeter', 0, 'entity_unknown')
    return lookupEntityZone(ctx.chosenZone, entity).perimeterTier === CHOSEN_TIER
      ? axis('perimeter', AXIS_MAX.perimeter, 'target_entity')
      : axis('perimeter', 0, 'other_entity')
  }
  if (ctx.zones.size === 0) return axis('perimeter', null, 'no_perimeter_context')
  if (!hasText(entity)) return axis('perimeter', 0, 'entity_unknown')
  const zone = lookupEntityZone(ctx.zones, entity)
  const tier = (zone.perimeterTier ?? '').toUpperCase()
  if (tier === 'P1') return axis('perimeter', 20, 'perimeter_p1')
  if (tier === 'P2') return axis('perimeter', 14, 'perimeter_p2')
  if (tier === 'SECONDAIRE') return axis('perimeter', 8, 'perimeter_secondary')
  const relevance = (zone.relevance ?? '').toLowerCase()
  if (relevance === 'out_of_sector' || relevance === 'noise') return axis('perimeter', 0, 'entity_outside')
  if (relevance === 'operating' || relevance === 'operational') return axis('perimeter', 10, 'entity_operating')
  // L'entité n'est pas rattachée à la cartographie : un trou du COMPTE, pas un zéro.
  return axis('perimeter', null, 'no_perimeter_context')
}

function accessibilityAxis(row: RankableContactRow): ContactRankingAxis {
  if (hasText(row.email) && row.email_verified) return axis('accessibility', 15, 'verified_email')
  if (hasText(row.email)) return axis('accessibility', 11, 'email')
  if (hasText(row.phone)) return axis('accessibility', 11, 'phone')
  if (hasText(row.linkedin_url)) return axis('accessibility', 5, 'professional_profile')
  // Jamais inventé : cherché sans rien trouver est un fait, jamais cherché ne l'est pas.
  if (row.last_enrichment_at) return axis('accessibility', 0, 'searched_nothing_found')
  return axis('accessibility', null, 'never_searched')
}

function topicAxis(
  key: 'subject' | 'offer',
  tokens: Set<string>,
  title: string | null,
  reasons: { match: ContactRankingReason; noMatch: ContactRankingReason; none: ContactRankingReason },
): ContactRankingAxis {
  if (tokens.size === 0) return axis(key, null, reasons.none)
  if (!hasText(title)) return axis(key, 0, 'title_unknown')
  return computeAngleMatchFromTokens({ title }, tokens) === true
    ? axis(key, AXIS_MAX[key], reasons.match)
    : axis(key, 0, reasons.noMatch)
}

function historyAxis(status: string | null, sentAt: string | null): ContactRankingAxis {
  if (status === 'replied' || status === 'meeting') return axis('history', 10, 'exchange_positive')
  if (status === 'refused') return axis('history', 0, 'declined')
  if (status === 'contacted' || status === 'silence' || sentAt) return axis('history', 6, 'exchange_sent')
  return axis('history', 0, 'no_exchange')
}

function relevantSeniorityAxis(level: HierarchyLevel, topics: ContactRankingAxis[]): ContactRankingAxis {
  const measured = topics.filter(topic => topic.points !== null)
  if (measured.length === 0) return axis('relevant_seniority', null, 'no_topic')
  if (!measured.some(topic => (topic.points ?? 0) > 0)) return axis('relevant_seniority', 0, 'seniority_not_relevant')
  if (level === 'c_level' || level === 'direction' || level === 'governance') {
    return axis('relevant_seniority', 5, 'senior_relevant')
  }
  if (level === 'management' || level === 'expert') return axis('relevant_seniority', 4, 'manager_relevant')
  return axis('relevant_seniority', 2, 'junior_relevant')
}

/** #2297.57 — les axes qui DÉPARTAGENT sans noter (la joignabilité), lus au contrat (GA-26). */
const TIE_BREAKER_KEYS = new Set<ContactRankingAxisKey>(CONTACT_RANKING_TIE_BREAKER_AXES)

/** Les axes ÉVALUÉS qui comptent dans le score — jamais un axe de départage (#2297.57). */
function scoredMeasured(axes: readonly ContactRankingAxis[]): ContactRankingAxis[] {
  return axes.filter(a => a.points !== null && !TIE_BREAKER_KEYS.has(a.key))
}

/** Points et plafond sur les SEULS axes évalués ; sous le seuil, pas de score.
 *  #2297.57 — la joignabilité n'y entre pas : elle départage, elle ne note pas. */
export function scoreFromAxes(axes: readonly ContactRankingAxis[]): { score: number | null; max: number | null } {
  const measured = scoredMeasured(axes)
  if (measured.length < MIN_RANKING_AXES_FOR_SCORE) return { score: null, max: null }
  return {
    score: measured.reduce((sum, a) => sum + (a.points ?? 0), 0),
    max: measured.reduce((sum, a) => sum + a.max, 0),
  }
}

function confidenceOf(axes: readonly ContactRankingAxis[], reachable: boolean): ContactRankingConfidence {
  const measured = axes.filter(a => a.points !== null).length
  if (measured < MIN_RANKING_AXES_FOR_SCORE) return 'not_measured'
  if (measured >= 7 && reachable) return 'high'
  if (measured >= 5) return 'medium'
  return 'low'
}

function accessPathOf(
  row: RankableContactRow,
  axes: Record<ContactRankingAxisKey, ContactRankingAxis>,
): ContactAccessPath {
  const found = (kind: NonNullable<ContactAccessPath['kind']>): ContactAccessPath => ({ kind, missing_reason: null })
  if ((axes.relationship.points ?? 0) > 0) return found('relationship')
  if (axes.history.reason === 'exchange_positive' || axes.history.reason === 'exchange_sent') return found('history')
  const reason = axes.accessibility.reason
  if (reason === 'verified_email' || reason === 'email' || reason === 'phone' || reason === 'professional_profile') {
    return found(reason)
  }
  return {
    kind: null,
    missing_reason: reason === 'searched_nothing_found' ? 'searched_nothing_found' : 'never_searched',
  }
}

function isoOrNull(value: Date | string | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function buildContext(rawAnalysis: Record<string, unknown> | null, params: ContactRankingParams) {
  const chosenPerimeter = hasText(params.perimeter) ? params.perimeter.trim() : null
  const chosenSubject = hasText(params.subject) ? params.subject.trim() : null
  const offer = hasText(params.offer) ? params.offer.trim() : null
  const angles = Array.isArray(rawAnalysis?.angles) ? (rawAnalysis.angles as Array<{ title?: string | null }>) : []
  const zones = buildEntityScoreContext(rawAnalysis)
  const subjectTokens = chosenSubject ? angleThemeTokens([{ title: chosenSubject }]) : angleThemeTokens(angles)
  const ctx: RankingContext = {
    zones,
    chosenZone: chosenPerimeter
      ? buildEntityScoreContext({ priority_perimeters: [{ name: chosenPerimeter, tier: CHOSEN_TIER }] })
      : null,
    subjectTokens,
    offerTokens: offer ? angleThemeTokens([{ title: offer }]) : new Set<string>(params.profileOfferTokens ?? []),
  }
  const summary: ContactRankingResponse['context'] = {
    perimeter: chosenPerimeter,
    perimeter_source: chosenPerimeter ? 'chosen' : zones.size > 0 ? 'account' : 'none',
    subject: chosenSubject,
    subject_source: chosenSubject ? 'chosen' : subjectTokens.size > 0 ? 'account' : 'none',
    offer,
    // Lot 758 — d'où vient l'offre qui a jugé l'axe `offer` : choisie, déclarée au profil, aucune.
    offer_source: offer ? 'chosen' : ctx.offerTokens.size > 0 ? 'profile' : 'none',
  }
  return { ctx, summary }
}

/**
 * #2295.5 — agrège les axes techniques ÉVALUÉS (jamais recalculés, GA-26) en
 * huit axes stratégiques. Un composant `points: null` sort du dénominateur de
 * l'axe stratégique qui le regroupe, exactement comme {@link scoreFromAxes}.
 */
function deriveStrategicAxes(byKey: Record<ContactRankingAxisKey, ContactRankingAxis>): StrategicAxis[] {
  return CONTACT_STRATEGIC_AXES.map(({ key, components }) => {
    const parts = components.map(k => byKey[k])
    const measured = parts.filter(p => p.points !== null)
    return {
      key,
      points: measured.length === 0 ? null : measured.reduce((sum, p) => sum + (p.points ?? 0), 0),
      // #2295.5 — comme `scoreFromAxes` : le plafond ne compte QUE les axes
      // techniques ÉVALUÉS, jamais un composant non mesuré comme s'il valait 0.
      max: measured.reduce((sum, p) => sum + p.max, 0),
      components: [...components],
    }
  })
}

/**
 * #2295.2 — le groupe nommé d'un contact ÉLIGIBLE (l'éligibilité elle-même est
 * une porte amont, `contact-eligibility.ts` — ce classificateur ne voit que
 * des contacts déjà passés).
 *
 * #2295.4 — RÈGLE DE SÉCURITÉ : un contact dont l'email n'est pas VÉRIFIÉ ne
 * peut jamais recevoir `first_door`. Proposer une adresse devinée comme porte
 * d'entrée, c'est un commercial qui écrit à quelqu'un qu'on n'a pas confirmé —
 * ce n'est pas une question de classement, c'est un risque.
 *
 * #2295.4bis — décision Louis 18/09/2026 (question 24, née de la livraison de
 * #2295.4) : en salle de démonstration, `email_verified` vaut TOUJOURS `false`
 * — les contacts de démo portent des adresses `.example`, qui ne peuvent
 * évidemment jamais être vérifiées. Le verrou #2295.4 restait donc juste,
 * mais vidait structurellement le groupe le plus important des six devant un
 * prospect. Le verrou se lève désormais AUSSI pour `row.demo_seed_first_door`
 * — un fait de SEMIS distinct d'une adresse vérifiée (voir sa définition sur
 * {@link RankableContactRow}) — sans jamais court-circuiter les groupes qui
 * priment (buyer / champion / decision_maker restent évalués AVANT).
 */
function classifyGroup(
  row: RankableContactRow,
  level: HierarchyLevel,
  byKey: Record<ContactRankingAxisKey, ContactRankingAxis>,
): ContactGroupKey {
  if (byKey.buying_role.reason === 'purchasing_role') return 'buyer'
  if (CHAMPION_ROLES.has((row.decision_role ?? '').toLowerCase())) return 'champion'
  const seniorityRelevant = (byKey.relevant_seniority.points ?? 0) > 0
  if (DECISION_POWER_LEVELS.has(level) && seniorityRelevant) return 'decision_maker'
  // #2295.4 / #2295.4bis — le verrou : sans email vérifié NI semis de démo,
  // jamais « première porte ».
  if (row.email_verified === true || row.demo_seed_first_door === true) return 'first_door'
  if (level === 'operationnel' || level === 'expert') return 'relay'
  return 'qualifier'
}

/**
 * #2295.8 — les CINQ dimensions d'explication dérivées du groupe seul
 * (`who`, `stage`, `unlocks`, `limit`) — la sixième, `next`, dépend du chemin
 * complet et se calcule après le tri ({@link rankAccountContacts}).
 *
 * Une seule table (GA-26) : `unlocks: null` nomme le groupe dont on ne sait
 * pas ce qu'il débloque (qualifier / relay — un premier contact non qualifié
 * n'ouvre encore rien de nommable). `antiAdviceWhat` (#2295.9) est le MÊME
 * calcul que `limit` sous un autre vocabulaire (l'action à ne pas faire,
 * plutôt que le fait) — jamais une seconde dérivation.
 */
const GROUP_EXPLANATION: Record<
  ContactGroupKey,
  {
    who: ContactExplanationReason
    stage: ContactExplanationReason
    unlocks: ContactExplanationReason | null
    limit: ContactExplanationReason
    antiAdviceWhat: ContactAntiAdviceWhat
  }
> = {
  first_door: {
    who: 'who_first_door',
    stage: 'stage_discovery',
    unlocks: 'unlocks_entry_confirmed',
    limit: 'limit_no_decision_power',
    antiAdviceWhat: 'dont_ask_for_decision',
  },
  qualifier: {
    who: 'who_qualifier',
    stage: 'stage_qualification',
    unlocks: null,
    limit: 'limit_no_budget_authority',
    antiAdviceWhat: 'dont_ask_for_budget',
  },
  champion: {
    who: 'who_champion',
    stage: 'stage_validation',
    unlocks: 'unlocks_internal_access',
    limit: 'limit_not_the_signer',
    antiAdviceWhat: 'dont_treat_as_signer',
  },
  decision_maker: {
    who: 'who_decision_maker',
    stage: 'stage_decision',
    unlocks: 'unlocks_final_decision',
    limit: 'limit_needs_procurement',
    antiAdviceWhat: 'dont_skip_procurement',
  },
  buyer: {
    who: 'who_buyer',
    stage: 'stage_procurement',
    unlocks: 'unlocks_budget_validation',
    limit: 'limit_not_technical_decision',
    antiAdviceWhat: 'dont_pitch_technical_choice',
  },
  relay: {
    who: 'who_relay',
    stage: 'stage_information',
    unlocks: null,
    limit: 'limit_no_authority',
    antiAdviceWhat: 'dont_treat_as_authority',
  },
}

/**
 * #2295.9 — l'anti-recommandation PAR CONTACT : « ne commence pas par… ».
 * `why` porte EXACTEMENT `explanation.limit.code` (GA-26, voir en-tête).
 */
function antiAdviceOf(group: ContactGroupKey): ContactAntiAdvice {
  const g = GROUP_EXPLANATION[group]
  return { what: g.antiAdviceWhat, why: g.limit }
}

/** #2295.8 — l'axe `history` est un FAIT (jamais `null`) : « pourquoi maintenant »
 *  l'est donc toujours, y compris quand le fait est « aucun échange ». */
function whenDimension(historyReason: ContactRankingReason): ContactExplanationDimension {
  const code: ContactExplanationReason =
    historyReason === 'exchange_positive'
      ? 'when_recent_positive_exchange'
      : historyReason === 'exchange_sent'
        ? 'when_pending_outreach'
        : historyReason === 'declined'
          ? 'when_declined_previously'
          : 'when_no_recent_signal'
  return { key: 'when', measured: true, code }
}

/**
 * #2295.8 — cinq des six dimensions ; `next` est ajoutée par l'appelant une
 * fois le chemin trié (elle dépend du contact suivant, pas de celui-ci seul).
 */
function explainContact(group: ContactGroupKey, historyReason: ContactRankingReason): Omit<ContactExplanation, 'next'> {
  const g = GROUP_EXPLANATION[group]
  return {
    who: { key: 'who', measured: true, code: g.who },
    when: whenDimension(historyReason),
    stage: { key: 'stage', measured: true, code: g.stage },
    unlocks:
      g.unlocks !== null
        ? { key: 'unlocks', measured: true, code: g.unlocks }
        : { key: 'unlocks', measured: false, code: 'unlocks_not_identified' },
    // #2295.8 — la SIXIÈME, toujours mesurée : ce que ce groupe ne peut pas
    // faire seul, pour qu'un relais ne se lise jamais comme un décideur.
    limit: { key: 'limit', measured: true, code: g.limit },
  }
}

type Evaluated = Omit<RankedContact, 'position' | 'explanation'> & {
  legacyPriority: number | null
  measured: number
  /** #2297.57 — l'importance du rôle (points de `decision_level`), premier départage. */
  rolePoints: number
  /** #2297.57 — la joignabilité, SECOND départage, à rôle égal seulement. */
  reachPoints: number
  explanation: Omit<ContactExplanation, 'next'>
  /** #3754 — le niveau que l'ESN donne à ce poste ; seulement posé par {@link applyTargetLevels}. */
  esnLevel?: EsnTargetLevel
  /** LOIC-FIX O.3 — pourquoi ce contact a été AVANCÉ par le statut d'accès du compte (#4271). */
  orderReason?: ContactOrderReason
}

function evaluate(row: RankableContactRow, ctx: RankingContext): Evaluated {
  const level = computeHierarchyLevel(row.title)
  const sentAt = isoOrNull(row.email_sent_at)
  const subject = topicAxis('subject', ctx.subjectTokens, row.title, {
    match: 'subject_match',
    noMatch: 'subject_no_match',
    none: 'no_subject',
  })
  const offer = topicAxis('offer', ctx.offerTokens, row.title, {
    match: 'offer_match',
    noMatch: 'offer_no_match',
    none: 'no_offer',
  })
  const byKey: Record<ContactRankingAxisKey, ContactRankingAxis> = {
    perimeter: perimeterAxis(row.entity, ctx),
    decision_level: axis(
      'decision_level',
      (ROLE_POWER[(row.decision_role ?? '').toLowerCase()] ?? 0) + LEVEL_USEFULNESS[level],
      LEVEL_REASON[level],
    ),
    accessibility: accessibilityAxis(row),
    subject,
    offer,
    buying_role:
      PURCHASING_ROLES.has((row.decision_role ?? '').toLowerCase()) || level === 'achats'
        ? axis('buying_role', AXIS_MAX.buying_role, 'purchasing_role')
        : axis('buying_role', 0, 'not_purchasing'),
    history: historyAxis(row.user_status, sentAt),
    relationship: RELATIONSHIP_SOURCES.has((row.source ?? '').toLowerCase())
      ? axis('relationship', AXIS_MAX.relationship, 'known_relationship')
      : axis('relationship', 0, 'no_relationship'),
    relevant_seniority: relevantSeniorityAxis(level, [subject, offer]),
  }
  const axes = CONTACT_RANKING_AXES.map(a => byKey[a.key])
  const accessPath = accessPathOf(row, byKey)
  const group = classifyGroup(row, level, byKey)
  return {
    contact_id: row.id,
    ...scoreFromAxes(axes),
    axes,
    strategic_axes: deriveStrategicAxes(byKey),
    group,
    // #2295.8 — `next` manque encore : ajoutée par `rankAccountContacts` une
    // fois le chemin trié, elle dépend du contact suivant.
    explanation: explainContact(group, byKey.history.reason),
    // #2295.9 — l'anti-recommandation par CONTACT, visible sur sa ligne.
    anti_advice: antiAdviceOf(group),
    confidence: confidenceOf(axes, byKey.accessibility.points !== null && byKey.accessibility.points > 0),
    access_path: accessPath,
    last_interaction_at: sentAt,
    legacyPriority:
      typeof row.priority === 'number' && Number.isInteger(row.priority) && row.priority >= 1 && row.priority <= 5
        ? row.priority
        : null,
    measured: scoredMeasured(axes).length,
    rolePoints: byKey.decision_level.points ?? 0,
    // #2297.57 — « jamais cherché » et « cherché sans rien trouver » ne se
    // départagent pas entre eux : aucun des deux n'a de coordonnée. La valeur
    // AFFICHÉE reste `null` (non mesuré ≠ 0) ; seule la clé de tri les égalise.
    reachPoints: byKey.accessibility.points ?? 0,
  }
}

/** #2295.8 — la sixième dimension citée par groupe suivant, pour `next`. */
const NEXT_REASON: Record<ContactGroupKey, ContactExplanationReason> = {
  first_door: 'next_first_door',
  qualifier: 'next_qualifier',
  champion: 'next_champion',
  decision_maker: 'next_decision_maker',
  buyer: 'next_buyer',
  relay: 'next_relay',
}

function compare(a: Evaluated, b: Evaluated): number {
  if ((a.score === null) !== (b.score === null)) return a.score === null ? 1 : -1
  if (a.score !== null && b.score !== null && a.max && b.max) {
    const diff = b.score / b.max - a.score / a.max
    if (Math.abs(diff) > 1e-9) return diff
  }
  // #2297.57 — à score égal, le rôle le plus important passe d'abord ; la
  // joignabilité ne départage QUE deux personnes au même rôle. Elle ne peut donc
  // jamais faire passer quelqu'un devant un rôle plus important.
  if (a.rolePoints !== b.rolePoints) return b.rolePoints - a.rolePoints
  if (a.reachPoints !== b.reachPoints) return b.reachPoints - a.reachPoints
  if (a.measured !== b.measured) return b.measured - a.measured
  // Le rang du prompt ne départage plus que deux égalités parfaites.
  const left = a.legacyPriority ?? Number.POSITIVE_INFINITY
  const right = b.legacyPriority ?? Number.POSITIVE_INFINITY
  if (left !== right) return left - right
  return a.contact_id.localeCompare(b.contact_id)
}

/**
 * #3754.3 — le niveau de l'ESN change l'ORDRE, jamais le CONTENU (c76) : tri
 * STABLE, niveau rapproché d'abord (1 < 2 < 3 < 4), les non rapprochés ensuite
 * dans l'ordre qu'ils avaient. Aucun poste cible → la liste revient inchangée.
 */
function applyTargetLevels(
  sorted: Evaluated[],
  rows: readonly RankableContactRow[],
  personas: PreparedTargetPersonas | undefined,
): Evaluated[] {
  if (!personas || personas.length === 0) return sorted
  const titleById = new Map(rows.map(row => [row.id, row.title]))
  const leveled = sorted.map((item, index) => {
    const level = matchTargetLevel(titleById.get(item.contact_id), personas)
    return { item: level ? { ...item, esnLevel: level } : item, level: level ?? 5, index }
  })
  leveled.sort((a, b) => a.level - b.level || a.index - b.index)
  return leveled.map(entry => entry.item)
}

/**
 * #4292.10 (Louis 21/10) — les décideurs (`economic`) et les sponsors connus passent DEVANT les référents
 * techniques, AVANT la coupe à dix : un décideur placé après le premier technique remonte juste devant lui
 * (tri STABLE, l'ordre de chaque palier est gardé). Le rôle change l'ORDRE, jamais le CONTENU (c76) ; aucun
 * critère protégé n'y entre. Les autres rôles ne sont pas touchés : un PDG hors sujet ne dépasse toujours pas
 * un responsable pertinent (#2120.27) — seul le technique, qui ne signe pas, lui cède la place. Placé avant
 * `applyTargetLevels` : les postes cibles de l'ESN affinent ensuite.
 */
const DECIDER_ROLES: ReadonlySet<string> = new Set(['economic', 'sponsor'])

function isKnownDecider(row: RankableContactRow | undefined): boolean {
  return DECIDER_ROLES.has((row?.decision_role ?? '').toLowerCase())
}

function decidersFirst(sorted: Evaluated[], rows: readonly RankableContactRow[]): Evaluated[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  const firstTechnical = sorted.findIndex(
    item => (byId.get(item.contact_id)?.decision_role ?? '').toLowerCase() === 'technical',
  )
  if (firstTechnical < 0) return sorted
  const lifted = sorted.slice(firstTechnical).filter(item => isKnownDecider(byId.get(item.contact_id)))
  if (lifted.length === 0) return sorted
  return [
    ...sorted.slice(0, firstTechnical),
    ...lifted,
    ...sorted.slice(firstTechnical).filter(item => !lifted.includes(item)),
  ]
}

/** SIG-B — les paliers d'un DIRIGEANT : nommé par une offre, il garde son rang. */
const LEADER_LEVELS: ReadonlySet<string> = new Set(['governance', 'c_level', 'direction'])

/**
 * SIG-B (11/10/2026) — un recruteur NOMMÉ par une offre publiée
 * (`source = 'job_posting'`, hors dirigeant) ne passe jamais devant un décideur :
 * tri STABLE qui le place après tous les autres, dans l'ordre qu'il avait. Le
 * rôle change l'ORDRE, jamais le CONTENU (c76) — personne n'est retiré.
 */
function recruitersAfterDeciders(sorted: Evaluated[], rows: readonly RankableContactRow[]): Evaluated[] {
  const recruiters = new Set(
    rows
      .filter(row => row.source === 'job_posting' && !LEADER_LEVELS.has(computeHierarchyLevel(row.title)))
      .map(row => row.id),
  )
  if (recruiters.size === 0) return sorted
  return [
    ...sorted.filter(item => !recruiters.has(item.contact_id)),
    ...sorted.filter(item => recruiters.has(item.contact_id)),
  ]
}

/**
 * #4271 (18/10) — le STATUT D'ACCÈS du compte change l'ORDRE des interlocuteurs, jamais leur
 * CONTENU (c76) : `referenced` (une ESN est déjà référencée) → les opérationnels et les
 * acheteurs passent devant ; `to_build` (accès à bâtir) → les décideurs et les sponsors passent
 * devant. Tri STABLE : à l'intérieur de chaque moitié, l'ordre d'avant est gardé ; personne n'est
 * retiré. Statut absent (non établi) → la liste revient inchangée, jamais un statut deviné.
 */
export type ContactAccessStatus = 'referenced' | 'to_build'

// #4802.2 — le RÔLE posé sur la personne compte, pas seulement le groupe calculé du titre : en recette
// prod, « à bâtir » faisait reculer les décideurs économiques (groupe ≠ decision_maker faute de titre de
// pouvoir) et « référencé » ne changeait rien (utilisateurs au titre senior). Ordre seulement (c76).
const REFERENCED_FRONT_ROLES: ReadonlySet<string> = new Set(['user', 'operational', 'procurement', 'purchasing'])

function accessFront(status: ContactAccessStatus, item: Evaluated, row: RankableContactRow | undefined): boolean {
  const level = computeHierarchyLevel(row?.title ?? null)
  const role = (row?.decision_role ?? '').toLowerCase()
  if (status === 'referenced') {
    return item.group === 'buyer' || level === 'operationnel' || level === 'achats' || REFERENCED_FRONT_ROLES.has(role)
  }
  return item.group === 'decision_maker' || item.group === 'champion' || DECIDER_ROLES.has(role)
}

function applyAccessStatus(
  sorted: Evaluated[],
  rows: readonly RankableContactRow[],
  status: ContactAccessStatus | undefined,
): Evaluated[] {
  if (!status) return sorted
  const rowById = new Map(rows.map(row => [row.id, row]))
  const front = sorted.filter(item => accessFront(status, item, rowById.get(item.contact_id)))
  if (front.length === 0 || front.length === sorted.length) return sorted
  // LOIC-FIX O.3 — la raison du passage devant voyage avec la personne : « Pourquoi ce rang ? »
  // la dit, au lieu de laisser un opérationnel N°1 sans explication. Jamais posée sans statut.
  const orderReason: ContactOrderReason = status === 'referenced' ? 'access_referenced' : 'access_to_build'
  // Seule une personne réellement PASSÉE devant quelqu'un porte la raison : un décideur déjà
  // premier par ses critères n'a rien à expliquer.
  const firstBackIndex = sorted.findIndex(item => !front.includes(item))
  return [
    ...front.map(item => (sorted.indexOf(item) > firstBackIndex ? { ...item, orderReason } : item)),
    ...sorted.filter(item => !front.includes(item)),
  ]
}

/**
 * LUDOVIC-C LC.1 — le périmètre du VENDEUR (zone, pack) change l'ORDRE, jamais le CONTENU
 * (c76) : tri STABLE sur un rang opaque fourni par l'appelant, avant la coupe à dix. Un
 * appelant range TOUS les éligibles ; un id sans rang passe après les rangés.
 */
function applyPerimeterTiers(sorted: Evaluated[], tiers: ReadonlyMap<string, number> | null | undefined): Evaluated[] {
  if (!tiers || tiers.size === 0) return sorted
  return sorted
    .map((item, index) => ({ item, tier: tiers.get(item.contact_id) ?? Number.POSITIVE_INFINITY, index }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(entry => entry.item)
}

/**
 * Classe les contacts d'un compte et rend le chemin recommandé (≤ 10 personnes,
 * #2120.13). Pur, sans I/O : l'appelant charge les lignes et `raw_analysis`.
 */
export function rankAccountContacts(
  rows: readonly RankableContactRow[],
  rawAnalysis: Record<string, unknown> | null,
  params: ContactRankingParams,
  limit: number = RECOMMENDED_PATH_MAX,
  /** #3754 — les postes cibles de l'ESN (niveau décideur), déjà préparés. Absents ou
   *  vides : le classement est EXACTEMENT celui d'avant (même ordre, même forme). */
  targetPersonas?: PreparedTargetPersonas,
  /** #4271 — le statut d'accès du compte ; absent : l'ordre est EXACTEMENT celui d'avant. */
  accessStatus?: ContactAccessStatus,
  /** LUDOVIC-C LC.1 — le rang de PÉRIMÈTRE du vendeur par contact (0 d'abord), calculé par
   *  l'appelant (`contact-seller-focus.ts`) : ce noyau ne lit toujours aucun lieu (GA-06).
   *  Absent : l'ordre est EXACTEMENT celui d'avant. */
  perimeterTiers?: ReadonlyMap<string, number> | null,
): ContactRankingResponse {
  const { ctx, summary } = buildContext(rawAnalysis, params)
  const sorted = rows.map(row => evaluate(row, ctx)).sort(compare)
  const evaluated = applyPerimeterTiers(
    applyAccessStatus(
      recruitersAfterDeciders(applyTargetLevels(decidersFirst(sorted, rows), rows, targetPersonas), rows),
      rows,
      accessStatus,
    ),
    perimeterTiers,
  )
  const path = evaluated.slice(0, Math.min(limit, RECOMMENDED_PATH_MAX))
  // #2375.5 — LA FRONTIÈRE : la probabilité d'obtenir une information TRIE, elle
  // ne s'affiche pas. Les quatre signaux déstructurés ci-dessous ORDONNENT et
  // s'arrêtent ici — `reachPoints` est exactement cette estimation (adresse
  // vérifiée 15, e-mail ou téléphone 11, profil 5, cherché sans rien trouver 0,
  // jamais cherché `null`). Ce qui franchit la ligne est la RAISON du rang, en
  // codes que l'écran traduit ; jamais le chiffre, jamais un pourcentage.
  // DÉCISION LOUIS 21/09/2026, qui PRÉCISE `c26_probabilite` sans l'entamer.
  // Garde GA-376 (`la-probabilite-trie-elle-ne-saffiche-pas.spec.ts`) : elle
  // compare les clés RENDUES à celles du contrat, donc supprimer cette
  // déstructuration fait rougir la CI.
  const ranked = path.map(
    (
      {
        legacyPriority: _legacy,
        measured: _measured,
        rolePoints: _role,
        reachPoints: _reach,
        esnLevel,
        orderReason,
        explanation,
        ...rest
      },
      index,
    ) => {
      // #2295.8 — « et ensuite » : le contact SUIVANT du chemin RENDU, jamais un
      // rôle inventé ; dernier de la liste affichée → nommé, pas deviné.
      const nextGroup = path[index + 1]?.group ?? null
      const next: ContactExplanationDimension = nextGroup
        ? { key: 'next', measured: true, code: NEXT_REASON[nextGroup] }
        : { key: 'next', measured: false, code: 'next_path_end' }
      // #3754.4 — la clé n'existe QUE si l'intitulé rapproche un poste cible.
      return {
        ...rest,
        ...(esnLevel ? { esn_target_level: esnLevel } : {}),
        ...(orderReason ? { order_reason: orderReason } : {}),
        position: index + 1,
        explanation: { ...explanation, next },
      }
    },
  )
  // Lot 758 (Loïc) — « les achats interviennent ensuite » ne disait pas QUI. L'acheteur
  // nommé est la première personne du groupe `buyer` dans l'ordre CALCULÉ (tous les
  // éligibles, pas seulement les dix affichés) ; `null` : aucun acheteur identifié au
  // dossier — dit tel quel, jamais un nom deviné.
  const buyer = evaluated.find(e => e.group === 'buyer')
  return {
    ranked,
    ...(rows.length > 0 ? { procurement_contact_id: buyer?.contact_id ?? null } : {}),
    total: rows.length,
    scored: evaluated.filter(e => e.score !== null).length,
    // #2295.3 — l'éligibilité se décide avant le rang : ce noyau pur ne
    // reçoit que des lignes déjà passées la porte (`contact-eligibility.ts`,
    // appelée en amont par le service). Toujours vide ici ; l'appelant
    // fusionne les exclusions réelles dans la réponse qu'il rend.
    excluded: [],
    // #4292.10 — aucun décideur ni sponsor identifié : le bloc le DIT (absent quand il y en a un, ou sans contact).
    ...(rows.length > 0 && !rows.some(isKnownDecider) && !evaluated.some(e => e.group === 'decision_maker')
      ? { no_decision_maker: true }
      : {}),
    context: summary,
  }
}
