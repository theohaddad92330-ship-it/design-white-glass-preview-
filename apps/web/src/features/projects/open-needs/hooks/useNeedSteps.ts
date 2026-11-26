import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateNeedStepInput, NeedStepStatus } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { needStepsApi, needStepsKeys } from '../api'

/** Les « prochaines étapes » cochables d'un besoin — LECTURE. */
export function useNeedSteps(needId: string) {
  const query = useQuery({
    queryKey: needStepsKeys.list(needId),
    queryFn: () => needStepsApi.list(needId),
    enabled: needId.length > 0,
  })
  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/** Cocher, décocher, ou marquer « en attente ». Le vrai chemin d'écriture qui
 *  manquait : avant ce lot, la seule « prochaine étape » de la fiche était une
 *  étiquette dérivée (`needNextAction`), non cochable. */
export function useUpdateNeedStep(needId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, status }: { stepId: string; status: NeedStepStatus }) =>
      needStepsApi.update(needId, stepId, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: needStepsKeys.list(needId) }),
    onError: error => toast.error(error.message || i18n.t('projects:needSheet.steps.updateError')),
  })
}

/** Ajouter une étape. */
export function useCreateNeedStep(needId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateNeedStepInput) => needStepsApi.create(needId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: needStepsKeys.list(needId) }),
    onError: error => toast.error(error.message || i18n.t('projects:needSheet.steps.createError')),
  })
}
