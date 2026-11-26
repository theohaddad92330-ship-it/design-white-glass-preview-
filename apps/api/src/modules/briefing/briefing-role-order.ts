import {
  BRIEFING_ACTION_KINDS as CONTRACT_BRIEFING_ACTION_KINDS,
  personaFromUserRole,
  workspaceRoleValues,
  type PilotagePersona,
  type BriefingAction,
  type WorkspaceRole,
} from '@bellum/contracts'
import { NOT_ACTIONABLE_NOW_PRIORITY } from './briefing-actions'

/**
 * #1936.11 — LE BRIEF VARIE SELON LE RÔLE : L'ORDRE CHANGE, LE CONTENU NON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ARBITRAGE, ET CE QU'IL INTERDIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis, 16/09/2026 : « c'est l'ORDRE qui change, pas le CONTENU. Tout le monde
 * voit les mêmes faits ; un commercial ouvre sur ses comptes et ses relances, un
 * manager sur l'équipe et les écarts, un dirigeant sur le pipe et la charge.
 * Rien n'est caché — cacher une information à quelqu'un qui y a droit crée deux
 * vérités dans la même ESN. »
 *
 * Donc : un ordonnancement, JAMAIS un filtrage. Chaque lecture ci-dessous
 * contient TOUS les genres de carte que le contrat connaît
 * (`BRIEFING_ACTION_KINDS`, `@bellum/contracts`), chacun exactement une fois, et
 * `briefing-role-order.spec.ts` le vérifie genre par genre — une lecture à qui
 * il en manquerait un serait un filtre déguisé en tri.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOT g26 (26/09/2026, épopée #2803) — TREIZE GENRES RATTRAPÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les genres `#2106.*`/`#2107.*`/`#2801` (`consultant_available` à
 * `invoicing_blocked_missing_data`) avaient rejoint `BRIEFING_ACTION_KINDS` côté
 * contrat sans jamais rejoindre les trois lectures ci-dessous : ce fichier
 * exportait sa PROPRE copie de dix genres (`READINGS.sales`), jamais comparée au
 * contrat réel — une garde qui se relit elle-même reste verte pour toujours,
 * même quand treize genres sur vingt-trois tombent tous dans le même trou
 * (« genre inconnu passe en FIN », identique pour les trois rôles). Le brief ne
 * variait donc plus par rôle pour plus de la moitié de ses propres genres.
 *
 * `BRIEFING_ACTION_KINDS` vient maintenant du contrat, jamais recopié. Les
 * treize nouveaux genres sont classés en trois familles, la même lecture pour
 * les trois rôles :
 *  - OPPORTUNITÉ DE STAFFING (`consultant_available`, `submission_no_response`,
 *    `renewal_not_engaged`) : une capacité ou un renouvellement à saisir —
 *    proche d'`account` pour un commercial, bas pour un manager (ce n'est pas
 *    un écart), proche du pipe pour un dirigeant.
 *  - INTÉGRITÉ DU PIPE (`project_no_next_action`, `project_stale`,
 *    `rfp_requirement_gap`, `account_no_owner`) : un dossier qui dérape sans
 *    incident déclaré — central pour un manager (ce SONT ses écarts), présent
 *    mais après les relances pour un commercial.
 *  - OPÉRATIONNEL ET FINANCIER (`connector_broken`, `mission_no_end_date`,
 *    `availability_reconfirm`, `cra_missing`, `invoice_ready`,
 *    `invoicing_blocked_missing_data`) : une panne ou un trou de donnée déjà
 *    survenu — le cash (`invoice_ready`/`invoicing_blocked_missing_data`) pèse
 *    tôt pour un dirigeant et un manager, la donnée d'hygiène pure
 *    (`mission_no_end_date`/`availability_reconfirm`) reste en fin partout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2095.41 (épopée #2993) — `contact_bounced` RATTRAPÉ (intégration chantier A, 26/09)
 * ─────────────────────────────────────────────────────────────────────────────
 * Même défaut que LOT g26 ci-dessus, à un seul genre : `contact_bounced` avait
 * rejoint `BRIEFING_ACTION_KINDS` côté contrat (commit 5172183921) sans jamais
 * rejoindre les trois lectures — `readingKinds` retombait sur vingt-trois genres
 * quand le contrat en comptait vingt-quatre, et la garde `briefing-role-order.spec.ts`
 * l'a détecté rouge dès la fusion. `urgency-tier.ts` le classe `administrative`,
 * même famille que `account_no_owner`/`mission_no_end_date` (une coordonnée en
 * échec est un manque de DONNÉE, pas une échéance commerciale) : posé juste après
 * `mission_no_end_date` dans les trois lectures.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI APRÈS LA TRONCATURE, ET PAS AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `buildBriefingActions` trie par urgence de famille puis coupe à
 * `BRIEFING_ACTIONS_MAX`. Réordonner AVANT la coupe changerait l'ENSEMBLE servi
 * — un manager perdrait la carte de compte que le commercial garde, et ce
 * serait exactement le filtrage refusé. Réordonner APRÈS ne touche qu'à ce
 * qu'on lit en premier : le SET est identique pour tout le monde.
 *
 * ⚠️ Le tri est STABLE : deux cartes du même genre gardent l'ordre d'urgence que
 * le serveur a calculé. On ne recalcule jamais une urgence ici — on choisit par
 * quelle FAMILLE la journée s'ouvre.
 */

/** Les genres de carte que le brief sait produire. */
type BriefingActionKind = BriefingAction['kind']

/**
 * Les quatre lectures (#3414 ajoute `recruiter` aux trois d'origine). Elles ne
 * classent pas des « importances » : elles disent par quoi la journée
 * COMMENCE pour qui l'ouvre.
 *
 * ⚠️ #2107.3 — `need_stale` (un besoin sans shortlist) s'est ajouté aux HUIT
 * genres : chaque lecture le porte exactement une fois, comme les sept autres,
 * sous peine de redevenir le filtre que ce fichier refuse.
 *
 * ⚠️ #2095.7 — `payment_overdue` (un paiement en retard) s'ajoute aux NEUF
 * genres, même règle. Un impayé est un ÉCART financier déjà survenu : il ouvre
 * la lecture `manager` (juste après `conflict`, l'autre écart déjà survenu) et
 * ouvre aussi `executive` (le cash est la première charge d'un dirigeant), et
 * reste plus bas côté `sales` — un commercial le voit, mais après ses comptes
 * et ses relances.
 *
 * ⚠️ #2095.8 — `rfp_due` (un appel d'offres proche de son échéance) s'ajoute
 * aux DIX genres, même règle. Une échéance manquée est un pipe PERDU, jamais
 * rattrapable : il ouvre `sales` juste après `account` (une AUTRE nouvelle
 * opportunité), ouvre `executive` juste après `payment_overdue` (le pipe est
 * la seconde charge d'un dirigeant, après le cash), et reste plus bas côté
 * `manager` — un écart d'ÉCHÉANCE, pas de dérapage déjà survenu.
 */
const READINGS = {
  /** Ses comptes et ses relances — celui qui vend. C'est aussi le défaut. */
  sales: [
    'follow_up',
    'reply',
    'account',
    'contact_left',
    'renewal_not_engaged',
    'mission_amendment_pending',
    'rfp_due',
    'rfp_requirement_gap',
    'consultant_available',
    'submission_no_response',
    'payment_overdue',
    'need_stale',
    'project_no_next_action',
    'project_stale',
    'meeting_prep',
    'meeting_no_followup',
    'task',
    'conflict',
    'mission_end',
    'mission_starting',
    'account_no_owner',
    'mission_no_end_date',
    'contact_bounced',
    'cra_missing',
    'invoice_ready',
    'invoicing_blocked_missing_data',
    'invoice_blocked',
    'critical_data_missing',
    'availability_reconfirm',
    'connector_broken',
  ],
  /** Les écarts — ce qui a dérapé : retards, impayés, conflits, fins de mission. */
  manager: [
    'conflict',
    'payment_overdue',
    'invoicing_blocked_missing_data',
    'invoice_blocked',
    'critical_data_missing',
    'cra_missing',
    'connector_broken',
    'account_no_owner',
    'mission_no_end_date',
    'mission_amendment_pending',
    'contact_bounced',
    'contact_left',
    'meeting_no_followup',
    'availability_reconfirm',
    'task',
    'mission_end',
    'mission_starting',
    'project_stale',
    'project_no_next_action',
    'rfp_requirement_gap',
    'meeting_prep',
    'rfp_due',
    'renewal_not_engaged',
    'follow_up',
    'need_stale',
    'submission_no_response',
    'reply',
    'consultant_available',
    'invoice_ready',
    'account',
  ],
  /**
   * #3414 (beta:bug, 30/09/2026) — talents, disponibilités, retours,
   * fins de mission : un recruteur ouvrait jusqu'ici sur la lecture `sales`
   * (comptes et relances), qui n'est pas sa journée. `recruiter` (le rôle
   * d'espace) existe déjà (`workspaceRoleValues`) ; il retombait sur `sales`
   * faute d'une lecture à lui — même défaut que LOT g26 plus haut, à
   * l'échelle d'un seul rôle plutôt que de treize genres.
   */
  recruiter: [
    'consultant_available',
    'availability_reconfirm',
    'submission_no_response',
    'mission_end',
    'mission_starting',
    'mission_no_end_date',
    'critical_data_missing',
    'renewal_not_engaged',
    'mission_amendment_pending',
    'need_stale',
    'task',
    'meeting_prep',
    'meeting_no_followup',
    'reply',
    'follow_up',
    'account',
    'conflict',
    'contact_bounced',
    'contact_left',
    'account_no_owner',
    'project_no_next_action',
    'project_stale',
    'rfp_due',
    'rfp_requirement_gap',
    'payment_overdue',
    'invoice_ready',
    'invoicing_blocked_missing_data',
    'invoice_blocked',
    'cra_missing',
    'connector_broken',
  ],
  /** Le pipe, la charge et le cash — les comptes qui bougent, les missions qui s'arrêtent. */
  executive: [
    'payment_overdue',
    'invoice_ready',
    'invoicing_blocked_missing_data',
    'invoice_blocked',
    'rfp_due',
    'rfp_requirement_gap',
    'renewal_not_engaged',
    'mission_amendment_pending',
    'project_stale',
    'project_no_next_action',
    'account',
    'need_stale',
    'consultant_available',
    'mission_end',
    'mission_starting',
    'cra_missing',
    'critical_data_missing',
    'account_no_owner',
    'submission_no_response',
    'connector_broken',
    'mission_no_end_date',
    'contact_bounced',
    'contact_left',
    'meeting_no_followup',
    'availability_reconfirm',
    'meeting_prep',
    'follow_up',
    'reply',
    'conflict',
    'task',
  ],
} as const satisfies Record<string, readonly BriefingActionKind[]>

export type BriefingReading = keyof typeof READINGS

/**
 * Quel rôle lit quoi.
 *
 * ⚠️ C'est une table de ce qu'on SAIT, jamais de ce qu'on écarte : un rôle
 * ajouté demain à `workspaceRoleValues` (GA-08 les ajoute en fin) retombe sur la
 * lecture `sales`, c'est-à-dire sur l'ordre qui existait avant ce fichier. Un
 * rôle neuf ne change donc JAMAIS un brief sans qu'on l'ait décidé, et
 * `briefing-role-order.spec.ts` refuse un rôle sans lecture.
 */
const READING_OF_ROLE: Record<WorkspaceRole, BriefingReading> = {
  owner: 'executive',
  finance: 'executive',
  admin: 'manager',
  sales_ops: 'manager',
  tech_admin: 'manager',
  sales: 'sales',
  member: 'sales',
  viewer: 'sales',
  recruiter: 'recruiter',
}

/**
 * #3386 (recette prod 02/10) — le rôle MÉTIER déclaré (`user_role`, réglé sur la
 * ligne du siège de /settings/team) n'arrivait à aucun ordre : le brief ne lisait
 * que le rôle d'ESPACE (propriétaire, membre…), si bien que Directeur d'agence →
 * Business Manager ne changeait rien à la réponse de Laura. Même table que le
 * pilotage (`personaFromUserRole`, GA-26 : un réglage, un endroit), ramenée aux
 * quatre lectures qui existent. ORDRE seulement (c76).
 */
const READING_OF_PERSONA: Record<PilotagePersona, BriefingReading> = {
  fondateur: 'executive',
  directeur_bu: 'manager',
  business_manager: 'manager',
  business_developer: 'sales',
  recrutement_staffing: 'recruiter',
}

/** La lecture d'un intitulé de poste ; `null` quand il n'a pas de vue dédiée (jamais une supposition). */
export function readingOfBusinessRole(userRole: string | null | undefined): BriefingReading | null {
  const persona = personaFromUserRole(userRole)
  return persona ? READING_OF_PERSONA[persona] : null
}

/** La lecture d'un rôle. `null` (rôle non lu) = la lecture par défaut. */
export function briefingReadingOf(role: WorkspaceRole | null | undefined): BriefingReading {
  if (!role) return 'sales'
  return READING_OF_ROLE[role] ?? 'sales'
}

/**
 * #3414 — le paramètre `readAs` de `GET /briefing/today`, validé contre les
 * rôles connus. Inconnu ou absent = `undefined` (le rôle réel décide), jamais
 * une erreur : un lien périmé ne doit pas casser l'écran.
 */
export function parseReadAs(raw: string | undefined): WorkspaceRole | undefined {
  return KNOWN_WORKSPACE_ROLES.find(role => role === raw)
}

/** Tous les rôles connus de l'espace — le corpus que la garde relit. */
export const KNOWN_WORKSPACE_ROLES: readonly WorkspaceRole[] = workspaceRoleValues

/**
 * Tous les genres que le contrat connaît (`@bellum/contracts`), jamais une
 * copie locale — LOT g26 : une copie locale est ce qui a laissé treize genres
 * sans lecture pendant plusieurs chantiers sans qu'aucune garde ne le voie.
 */
export const BRIEFING_ACTION_KINDS: readonly BriefingActionKind[] = CONTRACT_BRIEFING_ACTION_KINDS

/** Les genres d'une lecture, dans l'ordre. Exporté pour la garde. */
export function readingKinds(reading: BriefingReading): readonly BriefingActionKind[] {
  return READINGS[reading]
}

/**
 * Les actions, réordonnées pour ce rôle. Même ensemble, même nombre — jamais un
 * filtre. Une carte d'un genre inconnu de la lecture passe en FIN plutôt que de
 * disparaître : on ne perd pas une carte parce qu'on ne sait pas la ranger.
 */
export function orderActionsForRole<T extends { kind: BriefingActionKind; priority?: number }>(
  actions: readonly T[],
  role: WorkspaceRole | null | undefined,
  businessRole?: string | null,
): T[] {
  // Le rôle métier déclaré passe devant le rôle d'espace quand il a une vue.
  const order: readonly BriefingActionKind[] = READINGS[readingOfBusinessRole(businessRole) ?? briefingReadingOf(role)]
  const rankOf = (kind: BriefingActionKind): number => {
    const index = order.indexOf(kind)
    return index === -1 ? order.length : index
  }
  // L1 (31/10/2026) — DEUX règles GLOBALES de l'ordre, vraies pour toutes les
  // lectures (l'ordre seul change, jamais le contenu — c76) :
  //  - #2095.70 : une mission qui finit à J-30 ou moins (rang 5, voir
  //    `missionEndPriority`) passe juste avant le compte potentiel quand la
  //    lecture la rangeait après ;
  //  - #2095.71 : un problème qu'on ne peut pas résoudre maintenant
  //    (`NOT_ACTIONABLE_NOW_PRIORITY`) ferme la marche, quelle que soit la lecture.
  const rankOfAction = (action: T): number => {
    if ((action.priority ?? 0) >= NOT_ACTIONABLE_NOW_PRIORITY) return order.length + 1
    const rank = rankOf(action.kind)
    if (action.kind === 'mission_end' && (action.priority ?? Infinity) <= 5) {
      return Math.min(rank, rankOf('account') - 0.5)
    }
    return rank
  }
  // `map` puis tri sur (rang, index d'origine) : le tri natif est stable depuis
  // ES2019, mais l'index rend la stabilité EXPLICITE et testable.
  return actions
    .map((action, index) => ({ action, index, rank: rankOfAction(action) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.action)
}
