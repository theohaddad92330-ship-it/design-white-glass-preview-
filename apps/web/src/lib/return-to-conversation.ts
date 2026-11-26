/**
 * #1933.8 / #1903.20 — depuis une page ouverte par Laura, un bouton « Revenir
 * à la conversation » ramène au fil source. Le SEUL vocabulaire : `?from=chat:
 * <id>`, écrit sur le lien AVANT le clic (`PendingActions.tsx`) et lu sur la
 * page d'arrivée (`ReturnToConversationBanner.tsx`) — une dérivation vit à un
 * seul endroit (GA-26), jamais recopiée à chaque écran.
 *
 * ⚠️ Ce que ce mécanisme NE fait PAS : la navigation quitte la page, donc un
 * champ libre non soumis (texte tapé dans un dialogue, par exemple) ne
 * survit pas — ce n'est pas un état que l'URL peut porter. Ce qui SURVIT est
 * tout ce que l'écran dérive de SA PROPRE url (le préremplissage de Laura
 * compris) : un retour au fil PUIS un "précédent" du navigateur retrouve
 * l'écran tel que Laura l'avait ouvert.
 */

import { decodeLauraContextEnvelope, encodeLauraContextEnvelope, type LauraContextEnvelope } from '@bellum/contracts'

const RETURN_PREFIX = 'chat:'
/** #2147.9/.10 (épopée #2785) — le paramètre qui porte l'enveloppe de contexte, indépendant de `from` (voir le bloc de tête plus bas). */
const CONTEXT_PARAM = 'ctx'

/** L'identifiant du fil qu'un `?from=` porte, ou `null` — un `from` d'une
 *  autre nature (`welcome` sur `/chat`, par exemple) n'est pas un fil. */
export function conversationIdFromReturnParam(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (!raw.startsWith(RETURN_PREFIX)) return null
  const id = raw.slice(RETURN_PREFIX.length).trim()
  return id || null
}

/** Ajoute `from=chat:<id>` à une route déjà construite (avec ou sans requête),
 *  sans jamais écraser ce qu'elle porte déjà. Route inchangée sans `conversationId`
 *  — jamais un `from` deviné. */
export function withReturnToConversation(target: string, conversationId: string | null | undefined): string {
  if (!conversationId) return target
  const [beforeHash, hash] = target.split('#')
  const separator = beforeHash.includes('?') ? '&' : '?'
  const withParam = `${beforeHash}${separator}from=${RETURN_PREFIX}${encodeURIComponent(conversationId)}`
  return hash !== undefined ? `${withParam}#${hash}` : withParam
}

/** La même paire `from=chat:<id>`, sous la forme d'un objet `search` TanStack
 *  — pour les navigations qui construisent DÉJÀ un objet (`discoverSearch`,
 *  `campaignSearch`) plutôt qu'une chaîne. Objet VIDE sans identifiant :
 *  jamais une clé `from` posée à `undefined`, qui écrirait `?from=undefined`. */
export function returnToConversationSearch(
  conversationId: string | null | undefined,
): { from: string } | Record<string, never> {
  return conversationId ? { from: `${RETURN_PREFIX}${conversationId}` } : {}
}

/**
 * #2147.9/.10 (épopée #2785) — LA MÊME PAIRE, pour l'enveloppe de contexte.
 *
 * Indépendante de `from=chat:<id>` : une continuité qui n'a pas de fil
 * source (Découvrir → Analyser, #2147.12, n'en a pas) peut quand même
 * transporter une enveloppe. `ReturnToConversationBanner` lit les deux
 * paramètres séparément — chacun a son propre défaut d'absence.
 */
export function withLauraContext(target: string, envelope: LauraContextEnvelope | null): string {
  if (!envelope) return target
  const encoded = encodeLauraContextEnvelope(envelope)
  if (!encoded) return target
  const [beforeHash, hash] = target.split('#')
  const separator = beforeHash.includes('?') ? '&' : '?'
  const withParam = `${beforeHash}${separator}${CONTEXT_PARAM}=${encoded}`
  return hash !== undefined ? `${withParam}#${hash}` : withParam
}

/** La même enveloppe, sous la forme d'un objet `search` TanStack — voir {@link returnToConversationSearch}. */
export function lauraContextSearch(envelope: LauraContextEnvelope | null): { ctx: string } | Record<string, never> {
  if (!envelope) return {}
  const encoded = encodeLauraContextEnvelope(envelope)
  return encoded ? { [CONTEXT_PARAM]: encoded } : {}
}

/** L'enveloppe portée par le `search` COURANT, ou `null` — jamais devinée sur une valeur absente ou malformée. */
export function lauraContextEnvelopeFromSearch(search: Record<string, unknown>): LauraContextEnvelope | null {
  return decodeLauraContextEnvelope(search[CONTEXT_PARAM])
}
