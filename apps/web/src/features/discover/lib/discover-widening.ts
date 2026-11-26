import { criteriaWideningSchema, type CriteriaWidening } from '@bellum/contracts'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #4433 (épopée, Louis 21/10) — sous 10 résultats exacts, le moteur élargit de lui-même par paliers (compétence
 * proche, secteur voisin, taille voisine) et le dit dans `query.widening`. « Revenir au strict » est un geste de
 * l'écran : il se pose sur la recherche Registre en cours, sans relancer le rail.
 */
export function applyStrictCriteria(request: DiscoverRequest | null, strict: boolean): DiscoverRequest | null {
  if (!request || !strict || request.mode !== 'registry') return request
  return { mode: 'registry', query: { ...request.query, strictCriteria: true } }
}

/** `query.widening` validé par le contrat ; absent ou invalide = rien à dire (jamais un élargissement deviné). */
export function wideningOf(query: Record<string, unknown> | undefined): CriteriaWidening | null {
  const parsed = criteriaWideningSchema.safeParse(query?.widening)
  return parsed.success && parsed.data.steps.length > 0 ? parsed.data : null
}
