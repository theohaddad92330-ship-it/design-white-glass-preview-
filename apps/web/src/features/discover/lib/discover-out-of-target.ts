import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #2489.3/D1, #3551 — pose « chercher hors de ma cible » sur la recherche en cours,
 * en mode Registre COMME en mode Signaux. Le bouton s'affiche dès que la réponse
 * porte `targetSectorFilter` ; un réglage qui ne partait qu'en Registre le rendait
 * inerte sur « Comptes qui recrutent ». Bouton non actionné : requête inchangée.
 */
/**
 * #3873.6 — RENVERSE #2489.3/D1 (18/09), délibérément (Louis 10/10) : vider
 * TOUTES les cases secteurs du rail est un geste explicite qui LÈVE la cible du
 * profil pour la recherche suivante. Un rail jamais touché (vide par défaut)
 * n'est pas un vidage : la cible continue de filtrer.
 */
export function sectorsExplicitlyCleared(before: readonly string[], after: readonly string[]): boolean {
  return before.length > 0 && after.length === 0
}

/** État « vidé par l'utilisateur » après une édition du rail : posé au vidage,
 *  défait dès qu'une case est recochée, conservé sinon. */
export function nextSectorsCleared(current: boolean, before: readonly string[], after: readonly string[]): boolean {
  if (after.length > 0) return false
  return current || sectorsExplicitlyCleared(before, after)
}

export function applyOutOfTarget(request: DiscoverRequest | null, includeOutOfTarget: boolean): DiscoverRequest | null {
  if (!request || !includeOutOfTarget) return request
  return request.mode === 'registry'
    ? { mode: 'registry', query: { ...request.query, includeOutOfTarget: true } }
    : { mode: 'signals', query: { ...request.query, includeOutOfTarget: true } }
}
