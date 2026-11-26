import type {
  AutomationRuleView,
  AutomationSwitchPreviewView,
  AutomationTrialView,
  CreateAutomationRuleRequest,
  SaveAutomationRuleDraftRequest,
  UpdateAutomationRuleRequest,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * Lot L-D1 (#4167) — les règles d'automatisation (« quand signal → alors … »).
 * L'API borne tout par (espace, personne) : la liste est celle de CELUI QUI APPELLE.
 */
export const automationKeys = {
  rules: ['automation-rules'] as const,
  trials: ['automation-rules', 'trials'] as const,
}

export const automationRulesApi = {
  list: (): Promise<AutomationRuleView[]> => apiFetch<AutomationRuleView[]>({ path: '/automation-rules' }),
  create: (body: CreateAutomationRuleRequest): Promise<AutomationRuleView> =>
    apiFetch<AutomationRuleView, CreateAutomationRuleRequest>({ path: '/automation-rules', method: 'POST', body }),
  update: (id: string, body: UpdateAutomationRuleRequest): Promise<AutomationRuleView> =>
    apiFetch<AutomationRuleView, UpdateAutomationRuleRequest>({
      path: `/automation-rules/${id}`,
      method: 'PATCH',
      body,
    }),
  remove: (id: string): Promise<void> => apiFetch<void>({ path: `/automation-rules/${id}`, method: 'DELETE' }),
  // Théo C automations-editeur — le brouillon, l'essai, la version suivante, la copie, l'archivage.
  saveDraft: (id: string, body: SaveAutomationRuleDraftRequest): Promise<AutomationRuleView> =>
    apiFetch<AutomationRuleView, SaveAutomationRuleDraftRequest>({
      path: `/automation-rules/${id}/draft`,
      method: 'PUT',
      body,
    }),
  trial: (id: string): Promise<AutomationTrialView> =>
    apiFetch<AutomationTrialView>({ path: `/automation-rules/${id}/trial`, method: 'POST' }),
  switchPreview: (id: string): Promise<AutomationSwitchPreviewView> =>
    apiFetch<AutomationSwitchPreviewView>({ path: `/automation-rules/${id}/switch-preview` }),
  activateDraft: (id: string): Promise<AutomationRuleView> =>
    apiFetch<AutomationRuleView>({ path: `/automation-rules/${id}/activate-draft`, method: 'POST' }),
  duplicate: (id: string): Promise<AutomationRuleView> =>
    apiFetch<AutomationRuleView>({ path: `/automation-rules/${id}/duplicate`, method: 'POST' }),
  archive: (id: string): Promise<void> => apiFetch<void>({ path: `/automation-rules/${id}/archive`, method: 'POST' }),
  trials: (): Promise<AutomationTrialView[]> => apiFetch<AutomationTrialView[]>({ path: '/automation-rules/trials' }),
}

export function useAutomationRules() {
  return useQuery({ queryKey: automationKeys.rules, queryFn: automationRulesApi.list, staleTime: 30_000 })
}

function useInvalidateRules() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: automationKeys.rules })
}

/** Un modèle s'installe ÉTEINT puis s'allume d'un geste : deux appels, jamais une règle qui tourne sans geste. */
export function useActivateAutomationTemplate() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async (body: CreateAutomationRuleRequest) => {
      const created = await automationRulesApi.create(body)
      return automationRulesApi.update(created.id, { enabled: true })
    },
    onSettled: () => void invalidate(),
  })
}

export function useCreateAutomationRule() {
  const invalidate = useInvalidateRules()
  return useMutation({ mutationFn: automationRulesApi.create, onSuccess: () => void invalidate() })
}

export function useUpdateAutomationRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAutomationRuleRequest }) =>
      automationRulesApi.update(id, patch),
    onSuccess: () => void invalidate(),
  })
}

export function useDeleteAutomationRule() {
  const invalidate = useInvalidateRules()
  return useMutation({ mutationFn: automationRulesApi.remove, onSuccess: () => void invalidate() })
}

/** Théo C automations-bibliotheque.N3 — le journal des essais de la personne. */
export function useAutomationTrials() {
  return useQuery({ queryKey: automationKeys.trials, queryFn: automationRulesApi.trials, staleTime: 30_000 })
}

/** Théo C automations-editeur — enregistrer le brouillon d'une règle : celle qui tourne n'est pas touchée. */
export function useSaveAutomationDraft() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: SaveAutomationRuleDraftRequest }) =>
      automationRulesApi.saveDraft(id, draft),
    onSuccess: () => void invalidate(),
  })
}

/** « Tester le parcours » : un essai lit les vraies données, ne crée ni tâche ni message, et entre au journal. */
export function useAutomationTrial() {
  const invalidate = useInvalidateRules()
  return useMutation({ mutationFn: automationRulesApi.trial, onSuccess: () => void invalidate() })
}

/**
 * #2399.7 — la comparaison rendue avant la bascule. Jamais servie du cache : le serveur MARQUE la comparaison comme rendue,
 * et la bascule l'exige — chaque ouverture doit donc la relire pour de bon.
 */
export function useAutomationSwitchPreview(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...automationKeys.rules, 'switch-preview', id] as const,
    queryFn: () => automationRulesApi.switchPreview(id),
    enabled,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useActivateAutomationDraft() {
  const invalidate = useInvalidateRules()
  return useMutation({ mutationFn: automationRulesApi.activateDraft, onSuccess: () => void invalidate() })
}

export function useDuplicateAutomationRule() {
  const invalidate = useInvalidateRules()
  return useMutation({ mutationFn: automationRulesApi.duplicate, onSuccess: () => void invalidate() })
}

/** On archive, on ne supprime pas. */
export function useArchiveAutomationRule() {
  const invalidate = useInvalidateRules()
  return useMutation({ mutationFn: automationRulesApi.archive, onSuccess: () => void invalidate() })
}
