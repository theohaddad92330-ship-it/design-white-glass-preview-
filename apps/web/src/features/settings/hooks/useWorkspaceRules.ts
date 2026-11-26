import type { UpdateWorkspaceRules } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { WORKSPACE_RULES_KEY, workspaceRulesApi } from '../lib/workspace-rules-api'

/**
 * #2081.14 — la lecture ET le changement des règles d'espace, derrière un seul
 * hook. `canEdit` vient de l'API (propriétaire ou administrateur) : l'écran ne
 * le re-dérive pas du rôle, pour ne pas tenir une seconde définition de qui
 * pose les règles.
 */
export function useWorkspaceRules() {
  const { t } = useTranslation('workspaceRules')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: WORKSPACE_RULES_KEY,
    queryFn: () => workspaceRulesApi.get(),
    retry: false,
    staleTime: 0,
  })

  const update = useMutation({
    mutationFn: (patch: UpdateWorkspaceRules) => workspaceRulesApi.update(patch),
    onSuccess: rules => {
      queryClient.setQueryData(WORKSPACE_RULES_KEY, rules)
      toast.success(t('saved'))
    },
    onError: () => toast.error(t('saveFailed')),
  })

  return {
    rules: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    update: (patch: UpdateWorkspaceRules) => update.mutate(patch),
    saving: update.isPending,
  }
}
