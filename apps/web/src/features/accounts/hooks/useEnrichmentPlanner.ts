import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import type { OrgEnrichmentPlanEstimate, OrgEnrichmentPlanRequest, OrgEnrichmentWaveResult } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { contactKeys } from '@/features/contacts/api'

/**
 * Planificateur d'enrichissement de l'organigramme (§11 FINAL) — l'estimation
 * SEULE, recalculée à CHAQUE changement de mode ou de paramètre (§11 : « Le
 * coût est annoncé avant plan complet et avant toute vague personnalisée »).
 *
 * `params: null` = le mode choisi demande encore un paramètre que l'écran n'a
 * pas (l'entité de « Cette direction », le niveau de « Niveau hiérarchique »)
 * — la requête ne part PAS : on ne calcule jamais un périmètre à moitié saisi.
 */
export function useEnrichmentPlanEstimate(accountId: string, params: OrgEnrichmentPlanRequest | null) {
  return useQuery<OrgEnrichmentPlanEstimate>({
    queryKey: accountKeys.enrichmentPlan(accountId, params),
    queryFn: () => accountsApi.enrichmentPlan(accountId, params as OrgEnrichmentPlanRequest),
    enabled: params !== null,
    // Le serveur recalcule tout depuis les contacts à jour à chaque appel —
    // rien à garder « frais » entre deux ouvertures du dialogue.
    staleTime: 0,
  })
}

/**
 * Lance UNE vague du mode demandé — le clic « Lancer » après l'estimation
 * ci-dessus. `remaining > 0` dans la réponse : le même mode, relancé, reprend
 * au lot suivant (voir le docblock de `confirmWave` côté serveur pour ce que
 * ça couvre, et ce que ça ne couvre pas encore).
 */
export function useEnrichmentConfirm(accountId: string) {
  const qc = useQueryClient()

  return useMutation<OrgEnrichmentWaveResult, Error, OrgEnrichmentPlanRequest>({
    mutationFn: params => accountsApi.enrichmentConfirm(accountId, params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: contactKeys.byAccount(accountId) })
      // L'estimation affichée doit refléter ce qui vient d'être enrichi — sinon
      // « Enrichir les 50 suivants » resterait affiché après une vague réussie.
      qc.invalidateQueries({ queryKey: ['account', 'enrichment-plan', accountId] })
    },
  })
}
