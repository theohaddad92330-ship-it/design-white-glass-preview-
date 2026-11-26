import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  MemoryForgetAllResult,
  MemoryItemHistory,
  MemoryItemReassignableScope,
  MemoryLayer,
  MemoryLedger,
} from '@bellum/contracts'
import { memoryApi, memoryKeys, type PinnedFact } from '@/features/memory/api'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #1916.21 — le PROPRIÉTAIRE change la portée d'un élément qu'il a épinglé.
 * Invalide TOUTE la mémoire, comme l'oubli : la barre, la carte et le registre
 * lisent la même donnée, et un changement de portée change ce que les collègues
 * — et Laura, pour eux — lisent.
 */
export function useSetFactScope() {
  const qc = useQueryClient()
  return useMutation<PinnedFact | null, Error, { id: string; scope: MemoryItemReassignableScope }>({
    mutationKey: ['memory', 'scope'],
    mutationFn: ({ id, scope }) => memoryApi.setFactScope(id, scope),
    onSuccess: (_fact, { scope }) => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(i18n.t(`knowledge:memoryLedger.toast.scope.${scope}`))
    },
    onError: err => toast.error(i18n.t('knowledge:memoryLedger.toast.scopeFailed'), { description: err.message }),
  })
}

/**
 * #1916.19 / #1916.22 — modifier le texte et/ou l'échéance. Invalide TOUTE la
 * mémoire (l'historique compris) : le texte réécrit est celui que Laura relit,
 * et la barre du copilote comme le registre doivent le montrer.
 *
 * #1962.19 — sert aussi le geste dédié `confirm: true` (confirmer une note de
 * Laura SANS réécrire son texte) : même mutation, même invalidation, un toast
 * distinct pour ne pas dire « modifié » d'un geste qui n'a rien réécrit.
 */
export function useUpdateFact() {
  const qc = useQueryClient()
  return useMutation<
    PinnedFact | null,
    Error,
    { id: string; fact?: string; expiresAt?: string | null; confirm?: true }
  >({
    mutationKey: ['memory', 'update'],
    mutationFn: ({ id, ...patch }) => memoryApi.updateFact(id, patch),
    onSuccess: (_fact, variables) => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(
        i18n.t(variables.confirm ? 'knowledge:memoryLedger.confirm.confirmed' : 'knowledge:memoryLedger.edit.updated'),
      )
    },
    onError: err => toast.error(i18n.t('knowledge:memoryLedger.edit.updateFailed'), { description: err.message }),
  })
}

/**
 * #1916.23 — l'historique d'UN élément, lu seulement quand on l'ouvre (`id`
 * non nul) : une liste de trente éléments ne déclenche pas trente lectures.
 */
export function useFactHistory(id: string | null) {
  return useQuery<MemoryItemHistory | null, Error>({
    queryKey: memoryKeys.history(id ?? ''),
    queryFn: () => (id ? memoryApi.getFactHistory(id) : Promise.resolve(null)),
    enabled: id !== null,
  })
}

/**
 * Le registre de mémoire — tout ce que Laura garde, en clair.
 *
 * Pas de `staleTime` : on arrive sur cet écran pour VÉRIFIER ce qui est retenu,
 * et une liste de trente secondes d'âge y répondrait à côté.
 */
export function useMemoryLedger() {
  const { user } = useSession()
  return useQuery<MemoryLedger | null, Error>({
    queryKey: memoryKeys.ledger(),
    queryFn: () => memoryApi.getLedger(),
    enabled: !!user,
  })
}

/** Oublie UNE ligne. Invalide TOUTE la mémoire : la barre du copilote lit la
 *  même donnée, et deux vues qui divergent sur ce qui est retenu seraient pires
 *  que pas d'écran du tout. */
export function useForgetMemoryEntry() {
  const qc = useQueryClient()
  return useMutation<void, Error, { layer: MemoryLayer; id: string }>({
    mutationKey: ['memory', 'forget'],
    mutationFn: ({ layer, id }) => memoryApi.forgetLedgerEntry(layer, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(i18n.t('knowledge:memoryLedger.toast.forgotten'))
    },
    onError: err => toast.error(i18n.t('knowledge:memoryLedger.toast.forgetFailed'), { description: err.message }),
  })
}

/**
 * TOUT oublier. Le geste global, irréversible, confirmé avant.
 *
 * ⚠️ Le compte rendu n'est pas décoratif. Trois issues, TROIS phrases :
 *  · tout est parti — on dit combien ;
 *  · une couche a résisté — on la NOMME, et on dit que ces lignes sont encore
 *    là. « 12 lignes oubliées » serait un nombre VRAI qui se lit comme un
 *    succès complet ;
 *  · la réponse est illisible — on ne sait pas ce qui est parti, et on le dit.
 *    Le serveur a pu effacer avant que la réponse se perde ; annoncer « rien
 *    n'a été effacé » serait rassurant et faux.
 */
export function useForgetAllMemory() {
  const qc = useQueryClient()
  return useMutation<MemoryForgetAllResult | null, Error, void>({
    mutationKey: ['memory', 'forgetAll'],
    mutationFn: () => memoryApi.forgetAll(),
    onSuccess: report => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      if (!report) {
        toast.error(i18n.t('knowledge:memoryLedger.toast.forgetFailed'))
        return
      }
      if (report.failedLayers.length > 0) {
        toast.error(
          i18n.t('knowledge:memoryLedger.forgetAll.partial', {
            layers: report.failedLayers.map(layer => i18n.t(`knowledge:memoryLedger.layer.${layer}.title`)).join(', '),
          }),
        )
        return
      }
      if (report.forgotten === 0) {
        toast.success(i18n.t('knowledge:memoryLedger.forgetAll.doneNone'))
        return
      }
      toast.success(
        report.forgotten === 1
          ? i18n.t('knowledge:memoryLedger.forgetAll.doneOne')
          : i18n.t('knowledge:memoryLedger.forgetAll.done', { count: report.forgotten }),
      )
    },
    onError: err => toast.error(i18n.t('knowledge:memoryLedger.forgetAll.failed'), { description: err.message }),
  })
}
