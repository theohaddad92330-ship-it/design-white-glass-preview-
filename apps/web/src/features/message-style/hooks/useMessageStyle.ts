import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateMessageStyleTemplate,
  MessageLearningSummary,
  MessageStylePreviewCompareRequest,
  MessageStylePreviewResult,
  MessageStyleRuleProposal,
  MessageStyleRuleProposalDecision,
  MessageStyleTemplate,
  MessageStyleTemplateStatus,
  MessageStyleUsageStats,
} from '@bellum/contracts'
import { messageStyleApi } from '@/features/message-style/api'
import { useSession } from '@/lib/hooks/use-session'

const templatesKey = (userId?: string) => ['message-style-templates', userId] as const
const ruleProposalsKey = (userId?: string) => ['message-style-rule-proposals', userId] as const
const usageByStyleKey = (userId?: string) => ['message-style-usage', userId] as const

/** #2369.14 — les styles déjà validés/actifs, ce que Laura dit avoir « appris ». */
export function useMessageStyleTemplates() {
  const { user } = useSession()
  return useQuery<MessageStyleTemplate[]>({
    queryKey: templatesKey(user?.id),
    queryFn: () => messageStyleApi.listTemplates(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** #2204.59-.65 — créer un style sans import. La liste se relit : le style naît `draft`. */
export function useCreateMessageStyleTemplate() {
  const qc = useQueryClient()
  return useMutation<MessageStyleTemplate, Error, CreateMessageStyleTemplate>({
    mutationFn: input => messageStyleApi.createTemplate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['message-style-templates'] }),
  })
}

/** #2369.14 — les règles extraites, montrées avec leur statut de décision. */
export function useMessageStyleRuleProposals() {
  const { user } = useSession()
  return useQuery<MessageStyleRuleProposal[]>({
    queryKey: ruleProposalsKey(user?.id),
    queryFn: () => messageStyleApi.listRuleProposals(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** #2369.14 — « permettre de les corriger » : adopter ou refuser une proposition `pending`. */
export function useDecideMessageStyleRuleProposal() {
  const qc = useQueryClient()
  return useMutation<MessageStyleRuleProposal, Error, { id: string; decision: MessageStyleRuleProposalDecision }>({
    mutationFn: ({ id, decision }) => messageStyleApi.decideRuleProposal(id, decision),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['message-style-rule-proposals'] }),
  })
}

/** #2204.77 — faire passer un style d'un statut à l'autre (validé → actif : c'est lui que le composer applique). */
export function useTransitionMessageStyleTemplate() {
  const qc = useQueryClient()
  return useMutation<MessageStyleTemplate, Error, { id: string; to: MessageStyleTemplateStatus }>({
    mutationFn: ({ id, to }) => messageStyleApi.transitionTemplate(id, to),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['message-style-templates'] }),
  })
}

/** #2369.11 — le même exemple sous les quatre couches (générique/espace/utilisateur/finale). */
export function useMessageStylePreviewCompare() {
  return useMutation<MessageStylePreviewResult[], Error, MessageStylePreviewCompareRequest>({
    mutationFn: input => messageStyleApi.previewCompare(input),
  })
}

/** #2369.12 — les quatre taux d'usage PAR STYLE, jamais par personne. */
export function useMessageStyleUsage() {
  const { user } = useSession()
  return useQuery<MessageStyleUsageStats[]>({
    queryKey: usageByStyleKey(user?.id),
    queryFn: () => messageStyleApi.usageByStyle(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** #2877 — l'agrégat d'apprentissage des messages de l'espace (lecture seule). */
export function useMessageLearningSummary() {
  const { user } = useSession()
  return useQuery<MessageLearningSummary>({
    queryKey: ['message-learning-summary', user?.id],
    queryFn: () => messageStyleApi.learningSummary(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
