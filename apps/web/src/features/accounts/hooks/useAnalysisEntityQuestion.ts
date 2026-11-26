import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { AnalysisEntityAnswer, AnalysisEntityQuestion } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { accountKeys } from '@/features/accounts/api'

/**
 * #2164.17 — la question d'identité d'une analyse EN PAUSE
 * (`GET /analysis/:accountId/entity-question`) et sa réponse
 * (`POST /analysis/:accountId/entity-answer`).
 *
 * Relue toutes les 5 s tant que l'analyse tourne : la pause arrive juste après
 * la recherche, sans événement dédié. Hors analyse, aucune requête.
 */
const entityQuestionKeys = {
  forAccount: (accountId: string) => ['analysis', 'entity-question', accountId] as const,
}

const POLL_MS = 5_000

export function useAnalysisEntityQuestion(accountId: string, enabled: boolean) {
  return useQuery<{ question: AnalysisEntityQuestion | null }>({
    queryKey: entityQuestionKeys.forAccount(accountId),
    queryFn: () =>
      apiFetch<{ question: AnalysisEntityQuestion | null }>({ path: `/analysis/${accountId}/entity-question` }),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
  })
}

export function useAnswerEntityQuestion(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation<{ accountId: string; siren: string }, Error, string>({
    mutationFn: siren =>
      apiFetch<{ accountId: string; siren: string }, AnalysisEntityAnswer>({
        path: `/analysis/${accountId}/entity-answer`,
        method: 'POST',
        body: { siren },
      }),
    onSuccess: () => {
      queryClient.setQueryData(entityQuestionKeys.forAccount(accountId), { question: null })
      void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accountDetail:entityQuestion.answerFailed'))
    },
  })
}
