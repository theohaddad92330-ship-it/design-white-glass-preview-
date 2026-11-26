import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  CloseAssignmentInput,
  CreateFactoringContractInput,
  FactoringView,
  PrepareAssignmentInput,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

/**
 * LA CESSION DE CRÉANCE — le client de l'écran (31/08/2026).
 *
 * ⚠️ UNE seule lecture (`GET /factoring`) et non quatre : les compteurs de
 * l'entête et les lignes du tableau se calculent sur les mêmes cessions. Quatre
 * requêtes indépendantes les rendraient à quatre instants différents, et
 * l'entête finirait par contredire le tableau qu'elle surplombe.
 *
 * ⚠️ Toutes les routes sont derrière `finance:read` / `finance:write`. Un
 * lecteur sans le droit reçoit un 403, et l'écran le NOMME — il n'affiche pas
 * des compteurs à zéro, qui se liraient « rien de cédé ».
 */
export const factoringKeys = {
  view: ['factoring', 'view'] as const,
}

const factoringApi = {
  view(): Promise<FactoringView> {
    return apiFetch({ path: '/factoring' })
  },
  createContract(body: CreateFactoringContractInput): Promise<{ id: string }> {
    return apiFetch({ path: '/factoring/contracts', method: 'POST', body })
  },
  prepare(body: PrepareAssignmentInput): Promise<{ id: string }> {
    return apiFetch({ path: '/factoring/assignments', method: 'POST', body })
  },
  markAssigned(id: string): Promise<{ id: string }> {
    return apiFetch({ path: `/factoring/assignments/${id}/assigned`, method: 'POST', body: {} })
  },
  markSettled(id: string): Promise<{ id: string }> {
    return apiFetch({ path: `/factoring/assignments/${id}/settled`, method: 'POST' })
  },
  close(id: string, body: CloseAssignmentInput): Promise<{ id: string }> {
    return apiFetch({ path: `/factoring/assignments/${id}/close`, method: 'POST', body })
  },
  reconcile(settlementId: string, assignmentId: string): Promise<{ id: string }> {
    return apiFetch({
      path: `/factoring/settlements/${settlementId}/reconcile`,
      method: 'POST',
      body: { assignmentId },
    })
  },
}

export function useFactoringView() {
  return useQuery({
    queryKey: factoringKeys.view,
    queryFn: () => factoringApi.view(),
    // Un écran de trésorerie qu'on rouvre après avoir enregistré un règlement
    // ailleurs doit montrer l'état d'aujourd'hui, pas celui du cache.
    refetchOnMount: 'always',
    // Un 403 ne se réessaie pas : le droit ne va pas apparaître entre deux
    // tentatives, et trois requêtes de plus retardent seulement le message.
    retry: false,
  })
}

/** Le rafraîchissement commun aux six gestes : ils touchent tous la MÊME
 *  lecture, et n'en invalider qu'une partie ferait diverger l'entête. */
function useFactoringMutation<TInput>(
  run: (input: TInput) => Promise<{ id: string }>,
  successKey: string,
): ReturnType<typeof useMutation<{ id: string }, Error, TInput>> {
  const qc = useQueryClient()
  return useMutation<{ id: string }, Error, TInput>({
    mutationFn: run,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: factoringKeys.view })
      toast.success(i18n.t(`factoring:toast.${successKey}`))
    },
    onError: error => toast.error(error.message || i18n.t('factoring:toast.error')),
  })
}

export function useCreateFactoringContract() {
  return useFactoringMutation<CreateFactoringContractInput>(
    input => factoringApi.createContract(input),
    'contractSaved',
  )
}

export function usePrepareAssignment() {
  return useFactoringMutation<PrepareAssignmentInput>(input => factoringApi.prepare(input), 'prepared')
}

export function useMarkAssigned() {
  return useFactoringMutation<string>(id => factoringApi.markAssigned(id), 'assigned')
}

export function useMarkSettled() {
  return useFactoringMutation<string>(id => factoringApi.markSettled(id), 'settled')
}

export function useCloseAssignment() {
  return useFactoringMutation<{ id: string; input: CloseAssignmentInput }>(
    ({ id, input }) => factoringApi.close(id, input),
    'closed',
  )
}

export function useReconcileSettlement() {
  return useFactoringMutation<{ settlementId: string; assignmentId: string }>(
    ({ settlementId, assignmentId }) => factoringApi.reconcile(settlementId, assignmentId),
    'reconciled',
  )
}
