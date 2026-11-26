import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useCopiedFlash } from '@bellum/ui'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'

/**
 * #2226 — « je n'arrive pas à copier coller mes propres requêtes ».
 *
 * Mesuré : rien dans `chat-surface.ts` ni dans `Chat.tsx` n'empêche la
 * sélection à la souris (aucun `select-none`/`user-select`, aucun drag
 * `framer-motion`, aucun `onMouseDown`/`onCopy` qui l'intercepte) — la
 * sélection marche déjà. Le défaut mesuré est ailleurs : la réponse de Laura
 * porte un bouton « Copier » (`ReplyFooter::CopyReply`) et la question de
 * l'utilisateur n'en avait AUCUN. Sur mobile, où sélectionner dans une bulle
 * est pénible, ce bouton est le seul geste fiable.
 *
 * Même patron que `CopyReply` : icône seule (GA-32 — nom accessible via
 * `aria-label`), confirmation brève (`useCopiedFlash`), et un presse-papier
 * refusé DIT non plutôt que de prétendre avoir copié.
 */
export function CopyQuestion({ text }: { text: string }) {
  const { t } = useTranslation('chat')
  // #1152 : minuteur annulé au démontage — voir `useCopiedFlash`.
  const [copied, flashCopied] = useCopiedFlash(2000)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      flashCopied()
      toast.success(t('messages.questionCopied'), { duration: TOAST_SUCCESS_MS })
    } catch {
      toast.error(t('messages.questionCopyFailed'), { duration: TOAST_PROBLEM_MS })
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={t('messages.copyQuestion')}
      className="flex items-center justify-center rounded p-1 text-[var(--bellum-text-muted)] transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  )
}
