import type { MailMessage, MailThread, MailThreadState } from '@bellum/contracts'
import { selectPositiveReplies } from './no-reply'

/**
 * LE CLASSEMENT DE LA FILE DE TRAVAIL (#2104.14 / #2104.16 / #2104.17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran ne connaissait que TROIS onglets de filtre (`TRIAGE_INTENTS` :
 * `no_reply`, `positive_reply`, `unread`) — chacun une VUE, aucun n'étant un
 * CLASSEMENT. Deux fils non lus n'avaient aucun ordre entre eux, et rien ne
 * disait POURQUOI l'un devrait passer avant l'autre. Le retour demande « un
 * ordre de priorité en 6 niveaux fusionnés » et « le classement reste
 * explicable » — deux exigences qui n'en font qu'une : un niveau sans raison
 * ne se défend pas, une raison sans niveau ne trie rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES 6 NIVEAUX, DU PLUS URGENT AU PLUS CALME
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Réponse favorable NON LUE — le signal le plus fort, pas encore vu.
 * 2. Réponse favorable déjà lue — toujours une opportunité, moins urgente.
 * 3. Non lu, sans signal positif — quelque chose attend d'être lu.
 * 4. En attente de réponse depuis PLUS que le seuil de silence — une relance
 *    devient utile.
 * 5. En attente de réponse, mais encore sous le seuil — pas encore le moment.
 * 6. Rien de particulier, OU marqué manuellement (#2104.7 / #2104.8) : un fil
 *    traité ou signalé non pertinent retombe ici quels que soient les autres
 *    signaux — c'est le POINT du geste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉTAT UNIFIÉ (#2104.15)
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce module, l'écran rendait deux badges séparés (`unread`,
 * `awaitingReply`) qui disaient la même chose que ce module dit maintenant en
 * UN champ (GA-26 : un réglage ne vit qu'à un seul endroit). `treated` et
 * `irrelevant` sont des décisions humaines, elles l'emportent toujours sur ce
 * qui est simplement OBSERVÉ (lu/non lu, en attente ou non).
 */

/** La décision manuelle posée sur un fil (#2104.6/.7/.8) — `null` = aucune. */
type MailThreadMarkState = 'treated' | 'irrelevant' | 'archived' | null

type MailThreadPriority = {
  state: MailThreadState
  level: 1 | 2 | 3 | 4 | 5 | 6
  /**
   * Une clé STABLE, jamais une phrase toute faite : le serveur ne choisit pas
   * la langue de l'écran (`priorityReason.<clé>` côté i18n web, même
   * convention que `capabilities.${key}` plus haut dans ce module).
   */
  reason: string
}

/** Ce que la fonction a besoin de savoir d'un fil — jamais l'objet entier. */
type MailThreadPrioritySignals = Pick<MailThread, 'unread' | 'awaitingReply' | 'daysSinceLastMessage'>

/**
 * Le calcul, pur et testé : mêmes entrées, même sortie, toujours. Aucune
 * branche ne rend un niveau sans raison — c'est ce qui rend le classement
 * explicable (#2104.17).
 */
export function computeMailThreadPriority(
  thread: MailThreadPrioritySignals,
  isPositiveReply: boolean,
  silenceDays: number,
  mark: MailThreadMarkState,
): MailThreadPriority {
  // Théo B M1.N1 — un fil archivé est rangé comme un fil traité : rien à faire, il ne remonte pas.
  if (mark === 'treated' || mark === 'archived') return { state: 'treated', level: 6, reason: 'treated' }
  if (mark === 'irrelevant') return { state: 'irrelevant', level: 6, reason: 'irrelevant' }

  const state: MailThreadState = thread.unread ? 'unread' : thread.awaitingReply ? 'awaiting_reply' : 'read'

  if (isPositiveReply && thread.unread) return { state, level: 1, reason: 'positive_reply_unread' }
  if (isPositiveReply) return { state, level: 2, reason: 'positive_reply' }
  if (thread.unread) return { state, level: 3, reason: 'unread' }
  if (thread.awaitingReply) {
    const late = thread.daysSinceLastMessage !== null && thread.daysSinceLastMessage >= silenceDays
    return late ? { state, level: 4, reason: 'awaiting_reply_late' } : { state, level: 5, reason: 'awaiting_reply' }
  }
  return { state, level: 6, reason: 'none' }
}

/**
 * Les fils dont le dernier message ENTRANT ressemble à un accord, en
 * ENSEMBLE d'identifiants — pour une consultation en O(1) par fil, quel que
 * soit le nombre de fils affichés. `selectPositiveReplies` filtre déjà cette
 * même liste pour l'intention `positive_reply` ; ce module réutilise le
 * calcul plutôt que de le dupliquer (GA-26).
 */
export function positiveReplyThreadIds(threads: MailThread[], messages: MailMessage[]): Set<string> {
  return new Set(selectPositiveReplies(threads, messages).map(t => t.threadId))
}

/**
 * Tri stable par NIVEAU croissant (1 = le plus urgent en tête). Un fil sans
 * niveau connu (ne devrait pas arriver, mais un défaut de calcul ne doit
 * jamais planter le tri) retombe en dernier plutôt que de casser l'ordre des
 * autres.
 */
export function sortByPriority<T extends { priorityLevel?: number }>(threads: T[]): T[] {
  return [...threads].sort((a, b) => (a.priorityLevel ?? 6) - (b.priorityLevel ?? 6))
}
