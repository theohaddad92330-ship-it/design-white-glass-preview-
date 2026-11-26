import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { MemoryItemKind, MemoryItemOrigin, MemoryItemScope } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { memoryApi, memoryKeys, type PinnedFact } from '@/features/memory/api'

type PinInput = {
  fact: string
  accountId?: string | null
  kind?: MemoryItemKind
  /** D'où vient l'élément. Omis = `manual` (le défaut serveur) : c'est ce que
   *  fait la saisie à la main de la carte Mémoire. */
  origin?: MemoryItemOrigin
  expiresAt?: string | null
  /** #1917.3 — pour qui l'élément vaut, choisi par l'écran (`defaultMemoryScope`). */
  scope?: MemoryItemScope
  /** #1918.2 — le périmètre visé par `scope: 'business_unit'`. */
  businessUnitId?: string | null
  /** #1918.5 — le fil visé par `scope: 'conversation'`. */
  conversationId?: string | null
}

/**
 * Pin a fact to the copilot's durable memory. Invalidates every memory-facts
 * query on success so all views (global + per-account) refresh.
 */
export function usePinFact() {
  const qc = useQueryClient()
  return useMutation<PinnedFact | null, Error, PinInput>({
    mutationKey: ['memory', 'pin'],
    mutationFn: input => memoryApi.pinFact(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(i18n.t('knowledge:memory.toast.pinned'))
    },
    onError: err => toast.error(i18n.t('knowledge:memory.toast.pinFailed'), { description: err.message }),
  })
}
