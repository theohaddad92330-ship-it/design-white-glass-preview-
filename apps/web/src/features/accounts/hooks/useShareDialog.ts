import { useCopiedFlash } from '@bellum/ui'
import type { AccountShareSection } from '@bellum/contracts'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { useAccountShareLink } from './useAccountShareLink'

const COPIED_RESET_MS = 2_000

type UseShareDialogArgs = {
  accountId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Encapsulates the share dialog's state.
 *
 * #2735 — le lien ne se fabrique plus qu'au geste explicite : `createLink()`
 * est le SEUL endroit qui appelle `mutate()`. Rien dans ce hook n'appelle la
 * mutation au montage ni quand `open` passe à `true` — la fenêtre s'ouvre
 * donc toujours SANS lien. Fermer la fenêtre efface le lien créé
 * (`mutation.reset()`) : la rouvrir repart de zéro plutôt que d'exposer
 * l'ancien lien sans que l'utilisateur ait rien redemandé.
 */
export function useShareDialog({ accountId, onOpenChange }: UseShareDialogArgs) {
  const mutation = useAccountShareLink(accountId)
  // #1152 : minuteur annulé au démontage — voir `useCopiedFlash`.
  const [copied, flashCopied, resetCopied] = useCopiedFlash(COPIED_RESET_MS)
  const link = mutation.data?.url ?? null

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        resetCopied()
        mutation.reset()
      }
      onOpenChange(next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mutation` (objet react-query) change de référence à chaque rendu ; seule `mutation.reset` importe ici.
    [onOpenChange, resetCopied, mutation.reset],
  )

  // #2914 (#2128.11) — `section` absent = dossier ENTIER (comportement
  // historique) ; `'evaluation'` = ne fabrique un lien QUE pour le score.
  const createLink = useCallback(
    (section?: AccountShareSection) => {
      if (accountId) mutation.mutate(section)
    },
    [accountId, mutation.mutate],
  )

  const copy = useCallback(async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      flashCopied()
      toast.success(i18n.t('accounts:toast.linkCopied'))
    } catch {
      toast.error(i18n.t('accounts:toast.copyError'))
    }
  }, [link, flashCopied])

  return {
    link,
    section: mutation.data?.section ?? null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    copied,
    copy,
    createLink,
    handleOpenChange,
  }
}
