import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ConversationSummaryView } from '@bellum/contracts'
import { memoryApi, memoryKeys } from '@/features/memory/api'
import { i18n } from '@/i18n'

/**
 * #1955.30 — le résumé roulant du fil OUVERT, dans `/chat`. `enabled` laisse
 * l'appelant ne lire qu'à l'ouverture du panneau : un fil qu'on ne consulte
 * jamais ne déclenche jamais cette requête. Pas de `staleTime` : on ouvre ce
 * panneau pour vérifier ce que Laura a retenu MAINTENANT.
 */
export function useConversationSummary(args: {
  conversationId: string | null
  accountId: string | null
  enabled: boolean
}) {
  return useQuery<ConversationSummaryView, Error>({
    queryKey: memoryKeys.summary(args.conversationId, args.accountId),
    queryFn: () => memoryApi.getConversationSummary({ conversationId: args.conversationId, accountId: args.accountId }),
    enabled: args.enabled,
  })
}

/**
 * #1955.31 — « une correction humaine gagne toujours » (CLAUDE.md). N'invalide
 * QUE ce fil : corriger le résumé d'un compte ne change rien à celui d'un
 * autre.
 */
export function useCorrectConversationSummary(args: { conversationId: string | null; accountId: string | null }) {
  const qc = useQueryClient()
  return useMutation<ConversationSummaryView, Error, string>({
    mutationKey: ['memory', 'summary', 'correct'],
    mutationFn: (summary: string) =>
      memoryApi.correctConversationSummary({ conversationId: args.conversationId, accountId: args.accountId, summary }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.summary(args.conversationId, args.accountId) })
      toast.success(i18n.t('chat:summary.saved'))
    },
    onError: err => toast.error(i18n.t('chat:summary.saveFailed'), { description: err.message }),
  })
}
