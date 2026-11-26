import type { OrgCorrectionRequest, OrgCorrectionResponse, OrgGraphCorrection } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api'
import { apiFetch } from '@/lib/api'

/**
 * LES TROIS PORTES DU LEDGER DE CORRECTIONS — le chemin HTTP qui manquait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `OrgGraphController` monte trois routes depuis le 29/08 : le PATCH qui
 * corrige, le POST qui annule, le GET qui raconte. Elles ont leur verrou
 * optimiste, leur 409 porteur de diff, leur entité, leur migration, leurs
 * contrats et trois fichiers de tests. Mesuré le 30/08 :
 * `grep -rn "org-graph" apps/web/src` → **zéro**, `expectedGraphVersion` dans
 * `apps/web` → **zéro**. Aucun geste d'utilisateur ne les atteignait.
 *
 * Ce fichier est le maillon manquant, et rien d'autre : il n'ajoute aucune
 * règle, ne dérive rien, ne devine rien. Chaque fonction est un appel.
 *
 * ⚠️ **`expectedGraphVersion` n'a pas de valeur par défaut ici, et c'est
 * délibéré.** Un défaut (`?? 1`) ferait passer le verrou pour un formalisme :
 * la version DOIT venir du graphe que l'écran a sous les yeux
 * (`graph.graphVersion`), sinon on affirme une version qu'on n'a pas lue.
 *
 * ⚠️ **Aucune erreur n'est avalée.** Les mutations laissent remonter l'erreur
 * telle quelle — c'est l'écran qui décide quoi en faire, et pour le 409 il a
 * besoin du CORPS (`ApiError.details`), pas d'un booléen.
 */

export const orgCorrectionKeys = {
  history: (accountId: string) => ['account', accountId, 'org-graph', 'corrections'] as const,
}

/** L'historique du dossier — les annulées comprises. Aucune permission requise. */
export function useOrgCorrectionHistory(accountId: string, enabled = true) {
  return useQuery({
    queryKey: orgCorrectionKeys.history(accountId),
    queryFn: () => apiFetch<{ items: OrgGraphCorrection[] }>({ path: `/accounts/${accountId}/org-graph/corrections` }),
    select: response => response.items,
    enabled,
    staleTime: 30_000,
  })
}

/**
 * Poser une correction.
 *
 * Après un succès, DEUX invalidations : le dossier (le graphe a changé, donc
 * les cartes et la version affichée) et l'historique (une ligne de plus). Ne
 * rafraîchir que l'un des deux laisserait l'écran cohérent à moitié — et le
 * verrou refuserait la correction suivante, sur une version périmée que l'écran
 * continuerait d'afficher.
 */
export function useCorrectOrgPerson(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation<OrgCorrectionResponse, unknown, OrgCorrectionRequest>({
    mutationFn: request =>
      apiFetch<OrgCorrectionResponse, OrgCorrectionRequest>({
        path: `/accounts/${accountId}/org-graph/corrections`,
        method: 'PATCH',
        body: request,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      void queryClient.invalidateQueries({ queryKey: orgCorrectionKeys.history(accountId) })
    },
  })
}

/**
 * Annuler une correction — sous le MÊME verrou que la poser.
 *
 * « On archive, on ne supprime pas » : la ligne d'origine reste, elle reçoit sa
 * pierre tombale, et l'annulation dépose SA propre ligne. L'écran ne retire
 * donc rien de l'historique après un succès : il le recharge.
 */
export function useRevertOrgCorrection(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation<OrgCorrectionResponse, unknown, { correctionId: string; expectedGraphVersion: number }>({
    mutationFn: ({ correctionId, expectedGraphVersion }) =>
      apiFetch<OrgCorrectionResponse, { expectedGraphVersion: number }>({
        path: `/accounts/${accountId}/org-graph/corrections/${correctionId}/revert`,
        method: 'POST',
        body: { expectedGraphVersion },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      void queryClient.invalidateQueries({ queryKey: orgCorrectionKeys.history(accountId) })
    },
  })
}
