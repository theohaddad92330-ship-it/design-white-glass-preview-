import { isChatBranchKind, type ChatBranchKind } from '@bellum/contracts'
import type { ChatResponseContext } from './ContextDisclosure'

/**
 * REPRENDRE UNE RÉPONSE DE LAURA SANS REFAIRE CE QUI EST DÉJÀ PARTI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1953.12 — UNE BRANCHE, JAMAIS UN ÉCRASEMENT SILENCIEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * « Réessayer », « Répondre avec un autre angle » et « Modifier ma demande »
 * ne réécrivent jamais l'historique : ils ENVOIENT une nouvelle question (la
 * même, une variante, ou une version éditée) par le chemin normal du fil
 * (`handleSend` dans `Chat.tsx`), et la réponse qui arrive porte la trace de la
 * branche dont elle repart (`branchOf`) — l'ancienne réponse reste affichée,
 * marquée obsolète (#1953.14, voir `PendingActions.tsx`), jamais supprimée
 * (« on archive, on ne supprime pas »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1953.13 / #1953.20 — POURQUOI CE FICHIER NE PARLE JAMAIS D'ÉCRITURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce module ne fait QUE deux choses : comparer deux réponses déjà reçues
 * (`computeDataOrigin`), et composer le texte d'une nouvelle question
 * (`angleVariant`). Aucune des deux n'appelle un fournisseur, un CRM ou un
 * débit de crédit — la garde `apps/web/src/architecture/
 * retry-never-redispatches.test.ts` vérifie que ce fichier (et `Chat.tsx`)
 * n'importe jamais la porte d'écriture (`@/features/actions/api` et ses
 * voisins). Le copilote n'a aucun chemin d'écriture depuis un tour de chat —
 * ce n'est pas une convention, c'est l'absence de code (voir CLAUDE.md,
 * doctrine « ce qui n'écrit pas tout seul ») : un réessai qui rappelle
 * `askLauraStreaming` est donc structurellement sans risque de double envoi.
 * Le seul risque réel — une action DÉJÀ CONFIRMÉE qui redeviendrait
 * cliquable — est fermé par `.14` : la carte de la branche abandonnée devient
 * obsolète, jamais réinitialisée à « proposée ».
 */

/**
 * Pourquoi une nouvelle branche est apparue.
 *
 * La liste vit dans `@bellum/contracts` depuis #1953.11 : elle voyage
 * maintenant jusqu'à une colonne contrainte (`chat_messages.branch_kind`), donc
 * l'écran, le corps HTTP et la contrainte SQL lisent la MÊME (GA-26).
 */
export type BranchKind = ChatBranchKind

/**
 * #1953.21 — LA RÉPONSE DIT SI ELLE RÉUTILISE LES MÊMES DONNÉES, OU SI ELLE A
 * RELANCÉ UNE RECHERCHE.
 *
 * `reused` et `refreshed` ne coûtent pas la même chose et ne valent pas la
 * même fraîcheur (doctrine `Provenance` — la source ET la date) : c'est ce que
 * ce type nomme, jamais deviné, toujours calculé à partir des VRAIES sources
 * des deux réponses.
 */
export type DataOrigin = 'reused' | 'refreshed'

/** Ce que la branche précédente portait, capturé AVANT de reposer la question. */
export type PendingBranch = {
  kind: BranchKind
  /** L'heure de la réponse qu'on abandonne — la provenance de la branche (#1953.22). */
  previousTimestamp: Date | null
  previousContext: ChatResponseContext | undefined
  /**
   * #1953.11 — l'identifiant ENREGISTRÉ de la réponse qu'on abandonne, celui
   * que l'API a rendu quand elle a été écrite. C'est lui qui fait que la
   * provenance survit au rechargement : l'heure ci-dessus ne vit que dans
   * l'onglet, ce lien-ci part en base. `null` quand la réponse n'a pas été
   * enregistrée (démonstration, écriture échouée) — la branche existe alors
   * pour la session seule, jamais un lien inventé.
   */
  previousMessageId: string | null
}

/** Ce qu'une branche appose sur la réponse qui vient d'arriver. */
export type BranchOf = { kind: BranchKind; previousTimestamp: Date | null }

/** Le sous-ensemble de `ChatMessage` que ce module lit et écrit — pas de dépendance circulaire sur `Chat.tsx`. */
export type BranchableMessage = {
  role: 'user' | 'assistant'
  content: string
  context?: ChatResponseContext
  branchOf?: BranchOf
  dataOrigin?: DataOrigin | null
}

/**
 * La signature d'un jeu de sources — un ENSEMBLE, jamais une séquence : Laura
 * peut citer les mêmes sources dans un ordre différent d'un tour à l'autre
 * sans que ce soit une nouvelle recherche. Triée pour que l'ordre n'y change
 * rien.
 */
function sourceSignature(context: ChatResponseContext): string {
  return context.sources
    .map(source => `${source.kind}|${source.label}|${source.as_of ?? ''}`)
    .sort()
    .join('\n')
}

/**
 * `null` = non mesuré (un des deux tours n'a pas de panneau de transparence —
 * une réponse relue depuis l'historique, par exemple). Ce n'est jamais
 * `reused` par défaut : une valeur absente n'est pas une mesure (GA-18/GA-19).
 */
export function computeDataOrigin(
  previous: ChatResponseContext | undefined,
  next: ChatResponseContext | undefined,
): DataOrigin | null {
  if (!previous || !next) return null
  return sourceSignature(previous) === sourceSignature(next) ? 'reused' : 'refreshed'
}

/** Remonte au dernier message UTILISATEUR avant `index` — la question qu'une réponse a suivie. */
export function precedingUserText(messages: readonly BranchableMessage[], index: number): string | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const entry = messages[i]
    if (entry?.role === 'user') return entry.content
    if (entry?.role === 'assistant') continue
  }
  return null
}

/**
 * #1953.7 — LA QUESTION ORIGINALE, VERBATIM, PLUS LA DEMANDE.
 *
 * Jamais une question de remplacement inventée à sa place : Laura décide de
 * l'angle, on ne fait que le lui demander explicitement, dans les mêmes mots
 * que la personne verrait si elle relisait le fil (transparence — rien ne part
 * que la personne ne pourrait pas relire).
 */
export function angleVariant(question: string, suffix: string): string {
  return `${question}${suffix}`
}

/**
 * Décore la réponse qui vient d'arriver avec la branche dont elle repart, ou
 * la rend INCHANGÉE (même référence) quand aucune branche n'est en attente —
 * l'envoi normal d'un message tapé ne doit jamais gagner ces champs.
 */
export function applyPendingBranch<T extends BranchableMessage>(message: T, pending: PendingBranch | null): T {
  if (!pending) return message
  return {
    ...message,
    branchOf: { kind: pending.kind, previousTimestamp: pending.previousTimestamp },
    dataOrigin: computeDataOrigin(pending.previousContext, message.context),
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * #1953.11 / #1953.22 — LA PROVENANCE SURVIT AU RECHARGEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout ce qui précède décrit une branche PENDANT la session. Le 16/09/2026, la
 * mesure en production a montré que cela s'arrêtait là : après un rechargement
 * complet de la page, zéro élément du DOM ne portait « remplac ». Les deux
 * échanges se retrouvaient côte à côte, sans rien qui dise que le second est
 * une réédition du premier. La provenance était un état de SESSION, pas une
 * donnée.
 *
 * Elle en est une depuis la migration `ChatMessageBranchProvenance` :
 * `chat_messages.superseded_at`, `.branch_of_message_id`, `.branch_kind`,
 * servis par `GET /ia/chat/messages`. Cette fonction est la porte de retour —
 * du fil relu vers ce que l'écran sait afficher.
 */

/** La forme de message relu que cette porte lit — un sous-ensemble du fil servi. */
type SavedBranchWire = {
  id?: string
  created_at?: string
  superseded_at?: string | null
  branch_of_message_id?: string | null
  branch_kind?: string | null
}

/** Ce qu'un message relu regagne : sa marque de remplacement, sa provenance. */
type SavedBranch = { supersededAt?: Date; branchOf?: BranchOf }

/** Date ISO → `Date`, ou `undefined` si absente ou illisible — jamais une heure inventée. */
function parsedDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Ce que le fil relu redit de ses branches, message par message (clé = son id).
 *
 * Deux règles, les mêmes que partout ailleurs dans ce dépôt :
 *  · une nature INCONNUE n'invente pas de branche — un navigateur plus vieux
 *    que la valeur, ou une donnée abîmée, ne fabrique pas un lien ;
 *  · une heure illisible ou hors de la fenêtre lue (le fil se lit par tranche
 *    de 50) vaut `null`, jamais une date de remplissage. La branche reste
 *    affichée : ce qu'on ne sait pas, c'est son heure, pas son existence.
 *
 * Un message sans rien à dire n'a PAS d'entrée — l'appelant n'a alors aucun
 * champ à poser, et une bulle ordinaire reste byte-identique à ce qu'elle était.
 */
export function resolveSavedBranches(saved: readonly SavedBranchWire[]): Map<string, SavedBranch> {
  const createdById = new Map<string, Date | undefined>()
  for (const row of saved) {
    if (row.id) createdById.set(row.id, parsedDate(row.created_at))
  }

  const resolved = new Map<string, SavedBranch>()
  for (const row of saved) {
    if (!row.id) continue
    const entry: SavedBranch = {}
    const supersededAt = parsedDate(row.superseded_at)
    if (supersededAt) entry.supersededAt = supersededAt
    if (row.branch_of_message_id && isChatBranchKind(row.branch_kind)) {
      entry.branchOf = {
        kind: row.branch_kind,
        previousTimestamp: createdById.get(row.branch_of_message_id) ?? null,
      }
    }
    if (entry.supersededAt || entry.branchOf) resolved.set(row.id, entry)
  }
  return resolved
}
