import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Link2 } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger, Text, useCopiedFlash } from '@bellum/ui'
import { toast } from 'sonner'
import { auditShareUrl } from '../lib/audit-share-url'

/**
 * #2075.17 — « Partager dans le workspace », le point resté `reste` sur cinq
 * lots successifs (24-27/09) faute de GESTE défini. Ce que la revue a
 * confirmé entre-temps : l'audit est DÉJÀ visible à tout l'espace par
 * construction (un seul `esn_profiles` par workspace, comme `accounts.
 * service.ts` le fait pour un compte) — ce qui manquait n'était pas un accès
 * à ouvrir, mais un moyen de le DÉSIGNER à un collègue.
 *
 * Même patron, doctrine identique, qu'`apps/web/src/features/chat/view/
 * ShareConversation.tsx` (#1955.13) : aucune API, aucune table, aucun jeton —
 * écrire l'un ou l'autre ajouterait un second chemin de lecture pour une
 * donnée déjà accessible, exactement le doublon que GA-26 interdit. Le
 * popover dit qui pourra lire AVANT tout clic sur « Copier le lien » ; un
 * presse-papier refusé ne prétend jamais avoir copié.
 */
export function ShareAudit() {
  const { t } = useTranslation('commercialAudit')
  const [open, setOpen] = useState(false)
  const [copied, flashCopied, resetCopied] = useCopiedFlash(2000)

  async function copy() {
    const url = auditShareUrl(window.location.origin)
    try {
      await navigator.clipboard.writeText(url)
      flashCopied()
      toast.success(t('actions.shareCopied'))
    } catch {
      toast.error(t('actions.shareFailed', { url }))
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) resetCopied()
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" icon={Link2} className="pointer-coarse:min-h-11">
          {t('actions.share')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-3">
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('actions.shareNotice')}
        </Text>
        <Button variant="secondary" size="sm" icon={copied ? Check : Link2} onClick={() => void copy()} fullWidth>
          {copied ? t('actions.shareDone') : t('actions.shareCopyAction')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
