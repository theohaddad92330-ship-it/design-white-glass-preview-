import {
  Box,
  BrailleLoader,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { Check, Copy, Link2, Linkedin, Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShareDialog } from '@/features/accounts/hooks/useShareDialog'

type AccountShareDialogProps = {
  accountId: string
  companyName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LINKEDIN_URL = 'https://www.linkedin.com/sharing/share-offsite/'

function buildLinkedInShareUrl(targetUrl: string, summary: string): string {
  const params = new URLSearchParams({ url: targetUrl, summary })
  return `${LINKEDIN_URL}?${params.toString()}`
}

export function AccountShareDialog({ accountId, companyName, open, onOpenChange }: AccountShareDialogProps) {
  const { t } = useTranslation('accounts')
  const { link, section, isPending, isError, copied, copy, createLink, handleOpenChange } = useShareDialog({
    accountId,
    open,
    onOpenChange,
  })

  const handleLinkedIn = () => {
    if (!link) return
    const summary = t('share.linkedinSummary', { company: companyName })
    window.open(buildLinkedInShareUrl(link, summary), '_blank', 'noopener,noreferrer')
  }

  const handleNativeShare = async () => {
    if (!link || !navigator.share) return
    try {
      await navigator.share({ title: t('share.nativeTitle', { company: companyName }), url: link })
    } catch {
      // User dismissed or share failed — silent.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--border-subtle)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">{t('share.title')}</DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('share.description')}
          </DialogDescription>
        </DialogHeader>

        {isPending && (
          <Box display="flex" className="items-center justify-center py-6 text-[var(--bellum-text-accent)]">
            <BrailleLoader variant="grid-syncing" dotSize={2} dotGap={1} />
          </Box>
        )}

        {isError && (
          <Box display="flex" className="flex-col items-start gap-2 py-2">
            <Text element="p" size="sm" className="text-[var(--danger-soft-text)]">
              {t('share.error')}
            </Text>
            <Button variant="outline" size="sm" icon={Link2} onClick={() => createLink()}>
              {t('share.create')}
            </Button>
          </Box>
        )}

        {/* #2735 — la fenêtre s'ouvre SANS lien : ce bouton, et lui seul,
            fabrique le lien public (POST /accounts/:id/share). Décision de
            Louis, 22/09 soir (decisions-louis-22-09-soir.md §7).
            #2914 (#2128.11) — un second bouton fabrique un lien réduit à la
            section Score plutôt que le dossier entier ; chacun mint son
            propre lien (un lien = une section, jamais les deux à la fois). */}
        {!isPending && !isError && !link && (
          <Box display="flex" className="flex-col items-center justify-center gap-2 py-6">
            <Button variant="secondary" size="sm" icon={Link2} onClick={() => createLink()}>
              {t('share.create')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => createLink('evaluation')}>
              {t('share.createEvaluationOnly')}
            </Button>
          </Box>
        )}

        {link && (
          <Box display="flex" className="flex-col gap-3">
            {section === 'evaluation' && (
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('share.evaluationOnlyNotice')}
              </Text>
            )}
            <Box display="flex" className="items-center gap-2">
              <Input readOnly value={link} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                aria-label={copied ? t('share.copied') : t('share.copyLink')}
                onClick={copy}
                className="shrink-0"
              >
                {copied ? <Check className="size-4 text-[var(--success-soft-text)]" /> : <Copy className="size-4" />}
              </Button>
            </Box>

            <Box display="flex" className="items-center gap-2 pt-1">
              <Button variant="outline" size="sm" icon={Linkedin} onClick={handleLinkedIn} className="flex-1">
                LinkedIn
              </Button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <Button variant="outline" size="sm" icon={Share2} onClick={handleNativeShare} className="flex-1">
                  {t('share.other')}
                </Button>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
