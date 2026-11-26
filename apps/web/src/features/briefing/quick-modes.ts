/**
 * MODES DE TRAVAIL RAPIDES (#2918, #2100.1 à #2100.13).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE LOT LIVRE, ET CE QU'IL NE LIVRE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2100 décrit un système entier : le sélecteur de modes ET, après clic, une
 * SESSION GUIDÉE par Laura (objectif, durée, objets sélectionnés, étapes,
 * fin de session structurée alimentant l'audit — #2100.14 à .35, .37 à .39).
 * Le second morceau est un moteur d'état neuf, intégré à trois écrans
 * (Contacts, Actions, agenda) avec son propre journal — plusieurs jours de
 * travail, hors de ce qu'un lot de nuit peut prouver.
 *
 * « Tranché sans Louis » : ce module livre le sélecteur — quels modes sont
 * PERTINENTS pour ce commercial, MAINTENANT, à partir de signaux RÉELS
 * (#2100.9 à .13) — et un PREMIER fragment de la session guidée : sa DURÉE et
 * le VOLUME d'éléments qu'elle propose (#2100.15, #2100.37,
 * `QUICK_MODE_DURATION_MINUTES` / `guidedSessionItemVolume` plus bas). Un
 * mode non applicable n'apparaît jamais (#2100.9) ; c'est « aider à utiliser
 * le temps libre, pas présenter plus de données » (#2100.1) pris au pied de
 * la lettre.
 *
 * Reste (moteur d'état neuf, intégré à trois écrans avec son propre
 * journal — plusieurs jours de travail) : l'OBJECTIF et le RÉSULTAT ATTENDU
 * comme objets de session portés au clic (aujourd'hui seulement des libellés
 * d'écran, `quickModes.modes.*` dans les fichiers de langue), les ÉTAPES
 * (#2100.18), les ÉLÉMENTS DÉJÀ PRÊTS (#2100.20), le préfiltrage réel de
 * Contacts/Actions (#2100.23/.27), la proposition de blocage d'agenda
 * (#2100.28), et la FIN DE SESSION structurée qui alimente le suivi et
 * l'audit (#2100.31 à .35, .39).
 */

/** Les six modes (#2100.3 à #2100.8) — liste FERMÉE, l'ordre de l'annexe. */
export const QUICK_MODE_KEYS = [
  'prospect',
  'prepare_meetings',
  'handle_followups',
  'position_consultant',
  'secure_missions',
  'refresh_pipe',
] as const
export type QuickModeKey = (typeof QUICK_MODE_KEYS)[number]

/** Combien de modes AU PLUS (#2100.2 : « quatre à six choix maximum »). */
export const QUICK_MODES_MAX = 6

/**
 * Les signaux RÉELS qui décident quel mode est applicable. Chacun vient d'une
 * lecture déjà servie ailleurs (brief du jour, stats du vivier, permission
 * d'équipe) — aucun n'est recalculé ici (GA-26).
 */
export type QuickModeSignals = {
  /** Au moins un rendez-vous dans la fenêtre du brief (#2100.11). */
  hasUpcomingMeetings: boolean
  /** Au moins une relance en attente — réponse à traiter ou fil sans réponse. */
  hasFollowUps: boolean
  /** Une messagerie est connectée (#2100.12). */
  messagingConnected: boolean
  /**
   * Total du vivier (`TalentStats.total`). `null` = pas encore mesuré : le
   * mode ne s'affiche pas tant qu'on ne SAIT pas le vivier non vide — « on
   * n'affiche pas ce qu'on n'a pas ».
   */
  vivierCount: number | null
  /** Missions à sécuriser (fin proche, sans date de fin, renouvellement non engagé, paiement en retard). */
  missionsAtRiskCount: number
  /** `hasPermission(role, 'team:manage')` — même permission que l'onglet Équipe, jamais un second rôle inventé (#2100.13). */
  isManager: boolean
}

/** Une relance ne se traite pas pareil sans messagerie connectée (#2100.12) :
 *  le mode reste visible, son contenu change — CRM/tâches seulement. */
type FollowUpsVariant = 'messaging' | 'crm_only'

export type QuickMode = {
  key: QuickModeKey
  /** Seul `handle_followups` en porte un ; les autres modes n'ont qu'une forme. */
  followUpsVariant?: FollowUpsVariant
  /** #2100.13 — ce mode porte, pour un manager, une note d'arbitrage équipe en plus. */
  managerNote: boolean
}

/** Genres d'action déjà classés `mission_*`/`renewal_*`/`payment_overdue` (voir
 *  `BRIEFING_ACTION_KINDS`, `daily-briefing.ts`) — ce sont les MÊMES quatre
 *  genres que la carte « À faire maintenant » sait déjà nommer, jamais un
 *  second calcul de ce qui menace une mission. */
const MISSION_AT_RISK_KINDS = new Set(['mission_end', 'mission_no_end_date', 'renewal_not_engaged', 'payment_overdue'])

/** Genres d'action qui SONT une relance (`BRIEFING_ACTION_KINDS`). */
const FOLLOW_UP_KINDS = new Set(['follow_up', 'reply'])

/**
 * Les signaux du sélecteur, dérivés du brief du jour DÉJÀ chargé par cette
 * page — aucun appel réseau de plus. `actions` doit être la liste COMPLÈTE
 * des candidates (`useAllBriefingActions`, #2107), pas le top plafonné : un
 * genre évincé du plafond du brief ne doit pas éteindre son mode.
 */
export function deriveQuickModeSignalsFromBriefing(input: {
  actions: { kind: string }[]
  agendaServed: boolean
  agendaEventCount: number
  mailState: 'ready' | 'partial' | 'not_connected' | 'unavailable' | 'missing_scope'
  mailAwaitingReplyCount: number
  vivierCount: number | null
  isManager: boolean
}): QuickModeSignals {
  const hasFollowUpAction = input.actions.some(a => FOLLOW_UP_KINDS.has(a.kind))
  return {
    hasUpcomingMeetings: input.agendaServed && input.agendaEventCount > 0,
    hasFollowUps: hasFollowUpAction || (input.mailState === 'ready' && input.mailAwaitingReplyCount > 0),
    messagingConnected: input.mailState === 'ready',
    vivierCount: input.vivierCount,
    missionsAtRiskCount: input.actions.filter(a => MISSION_AT_RISK_KINDS.has(a.kind)).length,
    isManager: input.isManager,
  }
}

/**
 * #2100.15 / #2100.37 (épopée #2918, session guidée) — LA DURÉE d'une
 * session, par mode. Pas un choix libre à ce stade : #2100.3 nomme déjà sa
 * durée dans son propre libellé (« Prospecter pendant 45 min »), et
 * appliquer la même discipline aux cinq autres modes évite un mode qui
 * porterait une durée et cinq qui n'en porteraient aucune.
 */
export const QUICK_MODE_DURATION_MINUTES: Record<QuickModeKey, number> = {
  prospect: 45,
  prepare_meetings: 15,
  handle_followups: 20,
  position_consultant: 30,
  secure_missions: 20,
  refresh_pipe: 15,
}

/**
 * Combien de minutes prend UN élément de ce mode — une relance qualifiée, un
 * profil du vivier, un point mission… Tranché sans Louis, faute de mesure
 * réelle aujourd'hui : une ESTIMATION de départ, jamais un motif pour ne pas
 * donner de nombre du tout (la durée EST connue ; l'estimation qu'elle
 * implique l'est donc aussi — « on n'affiche pas ce qu'on n'a pas » ne
 * s'applique pas ici).
 */
const QUICK_MODE_MINUTES_PER_ITEM: Record<QuickModeKey, number> = {
  prospect: 15,
  prepare_meetings: 10,
  handle_followups: 2,
  position_consultant: 3,
  secure_missions: 4,
  refresh_pipe: 3,
}

/**
 * #2100.37 — « la durée influence le VOLUME proposé », jamais l'inverse : ce
 * nombre se DÉRIVE de la durée du mode, il ne se saisit pas à la main.
 */
export function guidedSessionItemVolume(key: QuickModeKey): number {
  return Math.max(1, Math.round(QUICK_MODE_DURATION_MINUTES[key] / QUICK_MODE_MINUTES_PER_ITEM[key]))
}

/**
 * Filtre les six modes selon le contexte. Ordre FIXE (celui de l'annexe) —
 * jamais trié par un score qui ferait bouger les cartes d'un rafraîchissement
 * à l'autre pour la même situation.
 */
export function computeQuickModes(signals: QuickModeSignals): QuickMode[] {
  const modes: QuickMode[] = []

  // #2100.3 — toujours pertinent : prospecter ne dépend d'aucune précondition
  // nommée par l'annexe (à la différence des trois modes ci-dessous).
  modes.push({ key: 'prospect', managerNote: false })

  // #2100.11 — aucun rendez-vous → pas de mode préparation.
  if (signals.hasUpcomingMeetings) {
    modes.push({ key: 'prepare_meetings', managerNote: false })
  }

  // #2100.5 / #2100.12 — le mode reste visible sans messagerie, mais change de
  // forme (CRM/tâches seulement) ; il disparaît seulement s'il n'y a RIEN à
  // relancer, messagerie ou pas.
  if (signals.hasFollowUps) {
    modes.push({
      key: 'handle_followups',
      followUpsVariant: signals.messagingConnected ? 'messaging' : 'crm_only',
      managerNote: false,
    })
  }

  // #2100.10 — vivier vide (ou pas encore mesuré) → pas de mode positionnement.
  if (signals.vivierCount !== null && signals.vivierCount > 0) {
    // #2100.13 — manager → la note d'arbitrage équipe s'attache ICI : c'est le
    // seul des six modes qui décide qui, dans l'équipe, part sur un compte.
    modes.push({ key: 'position_consultant', managerNote: signals.isManager })
  }

  if (signals.missionsAtRiskCount > 0) {
    modes.push({ key: 'secure_missions', managerNote: false })
  }

  // #2100.8 — toujours pertinent, même raison que « prospecter ».
  modes.push({ key: 'refresh_pipe', managerNote: false })

  // #2100.2 — garde-fou : la liste fermée compte déjà six entrées au plus,
  // ce test le vérifie plutôt que de le supposer.
  return modes.slice(0, QUICK_MODES_MAX)
}
