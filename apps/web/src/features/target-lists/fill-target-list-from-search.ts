import { accountsApi } from '@/features/accounts/api'
import { discoverApi } from '@/features/discover/api/discover-api'
import {
  applyRailConstraints,
  buildDiscoverRequest,
  type UnifiedFilters,
} from '@/features/discover/lib/discover-filters'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { targetListsApi } from './api'

interface FillTargetListResult {
  /** Comptes effectivement versés dans la cible lors de cet appel. */
  addedCount: number
  /** Ce que la recherche a renvoyé, AVANT le versement. */
  foundCount: number
  /** Candidats trouvés qu'un échec technique isolé a empêché de verser. */
  failedCount: number
}

/**
 * Rejoue la MÊME recherche que `/discover` — mêmes critères, même moteur
 * registre/signal ({@link buildDiscoverRequest}), plafond `DISCOVER_PAGE_SIZE`.
 * Séparée du versement (ci-dessous) pour que {@link useCreateTargetListFromSavedSearch}
 * puisse chercher AVANT de créer la liste : un échec de recherche ne doit pas
 * laisser une cible orpheline sur le serveur.
 */
export async function searchCandidatesForSavedSearch(filters: UnifiedFilters): Promise<DiscoverCandidate[]> {
  const request = buildDiscoverRequest(filters)
  if (!request) return []
  const response =
    request.mode === 'signals' ? await discoverApi.signals(request.query) : await discoverApi.registry(request.query)
  return applyRailConstraints(response.candidates, filters, request.mode)
}

/**
 * #3075 — le versement PARTAGÉ entre créer une cible depuis une recherche
 * enregistrée ({@link useCreateTargetListFromSavedSearch}) et RATTRAPER une
 * cible déjà créée mais restée vide/incomplète ({@link useRefillTargetListFromSavedSearch}).
 * Un seul chemin, jamais deux qui pourraient diverger (GA-26).
 *
 * Pour un candidat sans `accountId` encore, crée ou rattache le compte par le
 * chemin qui existe déjà pour « Ajouter à mon portefeuille » depuis Découvrir
 * ({@link accountsApi.addToPortfolio}, `POST /accounts/portfolio` — AUCUN
 * crédit débité, seule l'analyse en consomme).
 *
 * `alreadyInList` NOMME les comptes déjà versés (par un appel précédent, ou
 * une correction humaine) : ils ne sont jamais ni redemandés au portefeuille
 * ni redoublés en item — le rattrapage ne verse que ce qui MANQUE, et
 * n'écrase jamais un retrait humain.
 *
 * Un échec technique isolé (portefeuille ou ajout) ne bloque pas les autres
 * candidats (même doctrine que #2293.7 sur les lots d'analyse) — `failedCount`
 * le nomme, jamais un silence qui ressemblerait à un compte oublié.
 */
export async function addCandidatesToTargetList(
  listId: string,
  candidates: readonly DiscoverCandidate[],
  alreadyInList: ReadonlySet<string>,
): Promise<FillTargetListResult> {
  let addedCount = 0
  let failedCount = 0
  for (const candidate of candidates) {
    let accountId = candidate.accountId
    if (accountId && alreadyInList.has(accountId)) continue

    if (!accountId) {
      try {
        const portfolio = await accountsApi.addToPortfolio({
          company_name: candidate.name,
          siren: candidate.siren,
          ...(candidate.sector ? { sector: candidate.sector } : {}),
        })
        accountId = portfolio.id
      } catch {
        failedCount += 1
        continue
      }
      if (alreadyInList.has(accountId)) continue
    }

    try {
      await targetListsApi.addItem(listId, {
        kind: 'account',
        ref_id: accountId,
        provenance: 'discover',
      })
      addedCount += 1
    } catch {
      failedCount += 1
    }
  }

  return { addedCount, foundCount: candidates.length, failedCount }
}
