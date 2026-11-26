import { contextModeSchema, type ContextMode } from '@bellum/contracts'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #2454.4 — le mode de contexte est porté par l'URL (`?context=neutral`), comme
 * `class` et `type` : un lien qui ouvre Découvrir (depuis Laura, un favori, un
 * collègue) CONSERVE le mode, et une recherche neutre ne redevient jamais
 * personnalisée en changeant d'écran (NO-GO de l'issue).
 *
 * #2451.1 — absent ou hors vocabulaire : AUCUN mode. Ce n'est plus « Mon
 * activité » supposé : le serveur applique le défaut de l'ESPACE
 * (`workspaces.default_context_mode`) et la chip affiche celui qu'il rend.
 */
export function contextModeFromSearch(raw: unknown): ContextMode | undefined {
  const parsed = contextModeSchema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

/**
 * #2454.10 / #2451.1 — pose le mode CHOISI sur la recherche envoyée. Aucun
 * choix : la requête TELLE QUELLE (corps byte-identique à avant ce réglage).
 * Un choix part toujours, « Mon activité » comprise : c'est elle qui bat un
 * défaut d'espace « Neutre » (`resolveByPrecedence`, niveau « demande explicite »).
 */
export function applyContextMode(
  request: DiscoverRequest | null,
  mode: ContextMode | undefined,
): DiscoverRequest | null {
  if (!request || !mode) return request
  return request.mode === 'registry'
    ? { mode: 'registry', query: { ...request.query, contextMode: mode } }
    : { mode: 'signals', query: { ...request.query, contextMode: mode } }
}
