/**
 * #2799 (épopée) — le moteur de RÉACTIVATION DORMANTE (#2374.16/.17).
 *
 * Avant : `search_dormant_network` (`chat_tools.py`) ne filtrait que sur DEUX
 * critères — l'ancienneté du silence et la joignabilité — et l'ancienneté
 * était donc, de fait, le SEUL signal qui faisait remonter un contact.
 * #2374.17 interdit nommément cela : « ne pas réactiver uniquement parce que
 * le contact est ancien ».
 *
 * NEUF axes NOMMÉS ({@link DORMANT_REACTIVATION_AXES}), Σ(max) = 100, même
 * discipline que chaque score du dépôt (`contact-ranking.ts`,
 * `classified-data.ts::computeContactScoreBreakdown`) :
 *  - un axe non évaluable (`points: null`) sort du DÉNOMINATEUR et reste NOMMÉ
 *    (doctrine GA-18/19 — « non mesuré » n'est jamais 0) ;
 *  - une absence qui est un FAIT sur la ligne (aucun signal détecté, aucun
 *    porteur de compte) reste ÉVALUÉE à 0 — ce n'est pas un trou de
 *    connaissance ;
 *  - sous {@link MIN_DORMANT_REACTIVATION_AXES_FOR_SCORE} axes évalués, il n'y
 *    a PAS de score (`score: null`) — jamais un nombre bruité de sens ;
 *  - aucune probabilité, jamais de donnée inventée (CLAUDE.md).
 *
 * ⚠️ Ce n'est PAS un doublon de {@link ../schemas/contact-ranking.js} :
 * `CONTACT_RANKING_AXES` répond « qui approcher en premier DANS ce compte »
 * (comité d'achat, périmètre, offre). Ici la question est « quel contact
 * DORMANT, à travers tout le portefeuille, vaut la relance — et pourquoi ce
 * n'est pas juste parce qu'il est vieux ». Deux questions, deux grilles,
 * chacune un seul endroit (GA-26).
 */

/** Les neuf axes et leur plafond. Σ(max) = 100. Un seul endroit (GA-26). */
export const DORMANT_REACTIVATION_AXES = [
  // #2374.17 — plafonné bas et DÉCROISSANT avec le temps (voir
  // `scoreRecency` ci-dessous) : un silence ancien ne peut jamais, à lui
  // seul, faire remonter un contact.
  { key: 'recency', max: 10 },
  { key: 'reachability', max: 10 },
  { key: 'relationship_quality', max: 15 },
  { key: 'subject', max: 10 },
  { key: 'signal', max: 15 },
  { key: 'role', max: 15 },
  { key: 'account_fit', max: 15 },
  { key: 'owner', max: 5 },
  { key: 'reason', max: 5 },
] as const

export type DormantReactivationAxisKey = (typeof DORMANT_REACTIVATION_AXES)[number]['key']

export const DORMANT_REACTIVATION_SCORE_MAX = DORMANT_REACTIVATION_AXES.reduce((sum, a) => sum + a.max, 0)

/** Sous ce nombre d'axes évalués, pas de score (doctrine « un score n'est jamais nu »). */
export const MIN_DORMANT_REACTIVATION_AXES_FOR_SCORE = 3

export const DORMANT_REACTIVATION_AXIS_LABELS_FR: Record<DormantReactivationAxisKey, string> = {
  recency: 'Ancienneté du silence',
  reachability: 'Joignabilité',
  relationship_quality: 'Qualité de la relation',
  subject: 'Sujet du dernier échange',
  signal: 'Signal',
  role: 'Poste',
  account_fit: 'Compte',
  owner: 'Porteur',
  reason: 'Raison de le recontacter',
}

export const DORMANT_REACTIVATION_AXIS_LABELS_EN: Record<DormantReactivationAxisKey, string> = {
  recency: 'Length of silence',
  reachability: 'Reachability',
  relationship_quality: 'Relationship quality',
  subject: 'Last exchange topic',
  signal: 'Signal',
  role: 'Role',
  account_fit: 'Account',
  owner: 'Owner',
  reason: 'Reason to reach out',
}

/** FR (default) / EN label for an axis. */
export function dormantReactivationAxisLabel(key: DormantReactivationAxisKey, lang: 'fr' | 'en' = 'fr'): string {
  return (lang === 'en' ? DORMANT_REACTIVATION_AXIS_LABELS_EN : DORMANT_REACTIVATION_AXIS_LABELS_FR)[key]
}

export type DormantReactivationAxis = {
  key: DormantReactivationAxisKey
  max: number
  /** `null` = non évaluable — exclu du dénominateur, jamais un zéro deviné. */
  points: number | null
  /** Le fait qui justifie `points` — jamais une phrase inventée. `null` sur un axe non évalué. */
  proof: string | null
}

export type DormantReactivationScoreInput = {
  /** `null` = aucun échange JAMAIS enregistré avec ce contact (pas de silence à mesurer). */
  monthsSinceLastActivity: number | null
  hasEmail: boolean
  hasProfessionalNetwork: boolean
  /** Nombre d'échanges enregistrés, toute période confondue. `null` = jamais mesuré ; `0` = mesuré, aucun. */
  pastActivityCount: number | null
  /** Le sujet de la DERNIÈRE activité enregistrée. `null` = inconnue ou jamais renseignée. */
  lastActivitySubject: string | null
  /** `null` = signaux jamais calculés pour ce contact ; `[]` = calculés, aucun trouvé. */
  signals: ReadonlyArray<{ label: string }> | null
  decisionRole: string | null
  title: string | null
  /** Le score de compte /25 (`account_score.py`). `null` = jamais calculé. */
  accountPriorityScore: number | null
  /** Le porteur du COMPTE (`accounts.assigned_to`). `null` = non attribué (fait honnête). */
  accountAssignedTo: string | null
  /** La raison métier de ce contact (`contacts.why_contact`). */
  whyContact: string | null
}

export type DormantReactivationScore = {
  /** `null` sous {@link MIN_DORMANT_REACTIVATION_AXES_FOR_SCORE} axes évalués. */
  score: number | null
  maxPossible: number | null
  /** Toujours les neuf axes, évalués ou non — un score n'est jamais nu. */
  axes: DormantReactivationAxis[]
}

// #2374.17 — DÉCROISSANT avec le temps : 6-11 mois (fenêtre la plus fraîche du
// réseau dormant, défaut 6 mois côté `search_dormant_network`) vaut le plus ;
// au-delà de trois ans, le contexte a très probablement changé et l'axe
// retombe à son plancher. Jamais l'inverse — un contact ancien ne doit rien
// gagner de son ancienneté seule.
function scoreRecency(months: number | null): DormantReactivationAxis {
  const max = 10
  if (months === null) {
    return { key: 'recency', max, points: null, proof: null }
  }
  const points = months < 12 ? 10 : months < 24 ? 7 : months < 36 ? 4 : 2
  return { key: 'recency', max, points, proof: `${months} mois sans échange` }
}

function scoreReachability(hasEmail: boolean, hasProfessionalNetwork: boolean): DormantReactivationAxis {
  const max = 10
  const points = hasEmail && hasProfessionalNetwork ? 10 : hasEmail || hasProfessionalNetwork ? 6 : 0
  const proof =
    hasEmail && hasProfessionalNetwork
      ? 'e-mail et profil professionnel disponibles'
      : hasEmail || hasProfessionalNetwork
        ? 'un seul canal disponible'
        : 'aucun canal connu'
  return { key: 'reachability', max, points, proof }
}

function scoreRelationshipQuality(pastActivityCount: number | null): DormantReactivationAxis {
  const max = 15
  if (pastActivityCount === null) {
    return { key: 'relationship_quality', max, points: null, proof: null }
  }
  const points = pastActivityCount === 0 ? 0 : pastActivityCount <= 2 ? 5 : pastActivityCount <= 5 ? 10 : 15
  const proof =
    pastActivityCount === 0
      ? 'aucun échange jamais enregistré avec ce contact'
      : `${pastActivityCount} échange${pastActivityCount > 1 ? 's' : ''} enregistré${pastActivityCount > 1 ? 's' : ''}`
  return { key: 'relationship_quality', max, points, proof }
}

function scoreSubject(lastActivitySubject: string | null): DormantReactivationAxis {
  const max = 10
  const subject = lastActivitySubject?.trim() || null
  if (!subject) {
    return { key: 'subject', max, points: null, proof: null }
  }
  return { key: 'subject', max, points: 10, proof: subject }
}

function scoreSignal(signals: ReadonlyArray<{ label: string }> | null): DormantReactivationAxis {
  const max = 15
  if (signals === null) {
    return { key: 'signal', max, points: null, proof: null }
  }
  if (signals.length === 0) {
    return { key: 'signal', max, points: 0, proof: 'aucun signal détecté' }
  }
  return { key: 'signal', max, points: 15, proof: signals[0]?.label ?? 'signal détecté' }
}

// Même vocabulaire MEDDIC que `contact_priority_score.py::_ROLE_POWER` /
// `contact-ranking.ts` — le pouvoir de décision, jamais le prestige seul.
const ROLE_POWER: Record<string, number> = {
  economic: 15,
  sponsor: 15,
  technical: 14,
  champion: 12,
  user: 8,
  influencer: 7,
  procurement: 6,
  purchasing: 6,
  blocker: 4,
}

function scoreRole(decisionRole: string | null, title: string | null): DormantReactivationAxis {
  const max = 15
  if (!decisionRole && !title) {
    return { key: 'role', max, points: null, proof: null }
  }
  const points = decisionRole ? (ROLE_POWER[decisionRole] ?? 0) : 0
  const proof = title?.trim() || decisionRole || 'poste non classé'
  return { key: 'role', max, points, proof }
}

// /25 → /15, même grille que `account_score.py` (5 axes × 5 = 25).
function scoreAccountFit(accountPriorityScore: number | null): DormantReactivationAxis {
  const max = 15
  if (accountPriorityScore === null) {
    return { key: 'account_fit', max, points: null, proof: null }
  }
  const points = Math.max(0, Math.min(max, Math.round((accountPriorityScore / 25) * max)))
  return { key: 'account_fit', max, points, proof: `score de compte ${accountPriorityScore}/25` }
}

function scoreOwner(accountAssignedTo: string | null): DormantReactivationAxis {
  const max = 5
  const points = accountAssignedTo ? max : 0
  const proof = accountAssignedTo ? 'compte porté par un commercial identifié' : 'compte non attribué'
  return { key: 'owner', max, points, proof }
}

function scoreReason(whyContact: string | null): DormantReactivationAxis {
  const max = 5
  const reason = whyContact?.trim() || null
  if (!reason) {
    return { key: 'reason', max, points: null, proof: null }
  }
  return { key: 'reason', max, points: max, proof: reason }
}

export function computeDormantReactivationScore(input: DormantReactivationScoreInput): DormantReactivationScore {
  const axes: DormantReactivationAxis[] = [
    scoreRecency(input.monthsSinceLastActivity),
    scoreReachability(input.hasEmail, input.hasProfessionalNetwork),
    scoreRelationshipQuality(input.pastActivityCount),
    scoreSubject(input.lastActivitySubject),
    scoreSignal(input.signals),
    scoreRole(input.decisionRole, input.title),
    scoreAccountFit(input.accountPriorityScore),
    scoreOwner(input.accountAssignedTo),
    scoreReason(input.whyContact),
  ]

  const evaluated = axes.filter((axis): axis is DormantReactivationAxis & { points: number } => axis.points !== null)
  if (evaluated.length < MIN_DORMANT_REACTIVATION_AXES_FOR_SCORE) {
    return { score: null, maxPossible: null, axes }
  }
  const score = evaluated.reduce((sum, axis) => sum + axis.points, 0)
  const maxPossible = evaluated.reduce((sum, axis) => sum + axis.max, 0)
  return { score, maxPossible, axes }
}
