import type { MarketContextMatch } from '@bellum/contracts'
import { marketFitFor } from '@/features/discover/lib/market-context'

/**
 * #2090.36 / #2090.38 / #2090.41 — LA MÉMOIRE MARCHÉ, DANS L'AUDIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE DÉRIVATION NE PEUT PAS RENDRE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Le retour demande logo, entreprise, ville, secteur, raison de
 * compatibilité. `marketContextMatchSchema` (`packages/contracts/src/schemas/
 * companies.ts`) ne porte que `companyName` et `coverage` — NI logo, NI ville,
 * NI secteur. Les ajouter suppose un changement de contrat + de service
 * (`MarketMemoryService.searchByFilters`) hors du périmètre WEB de ce lot :
 * ils ne sont donc PAS inventés ici (`c'est une donnée fictive» qu'on refuse
 * partout ailleurs dans ce produit). Ce qui EST rendu : le nom, et la
 * RAISON DE COMPATIBILITÉ décomposée — les expertises déclarées que la pile
 * observée retrouve, calculée par `marketFitFor` (le MÊME appariement que
 * Découvrir et `MarketAwarenessCard`, jamais un second calcul qui
 * divergerait, GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN APERÇU BORNÉ, PLUTÔT QUE TOUT CE QUE LE CORPUS REND
 * ─────────────────────────────────────────────────────────────────────────
 * `MarketMemoryService.searchByFilters` répond jusqu'à 20 résultats par
 * défaut (`MARKET_SEARCH_DEFAULT_LIMIT`) — pas la borne « 3 à 6 comptes »
 * que #2090.37 doit encore poser côté service. En attendant, cette carte se
 * borne elle-même : mieux vaut un aperçu HONNÊTEMENT partiel (le badge
 * `marketMemory.limit` le dit) qu'une liste qui ressemblerait à une recherche
 * exhaustive.
 */
export const AUDIT_MARKET_MEMORY_MAX_ACCOUNTS = 6

type AuditMarketMemoryAccount = {
  companyName: string
  /** `true` quand au moins une expertise déclarée recoupe la pile observée. */
  compatible: boolean
  /** Les expertises déclarées RETROUVÉES — la raison décomposée, jamais un score. */
  matchedExpertises: readonly string[]
}

export function buildAuditMarketMemoryAccounts(
  matches: readonly MarketContextMatch[],
  declaredExpertises: readonly string[],
): AuditMarketMemoryAccount[] {
  return matches.slice(0, AUDIT_MARKET_MEMORY_MAX_ACCOUNTS).map(match => {
    const fit = marketFitFor(match.coverage, declaredExpertises)
    return { companyName: match.companyName, compatible: fit.label === 'matched', matchedExpertises: fit.matched }
  })
}
