import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bellum/ui'
import type { ProfileContextRegenerableSection } from '@bellum/contracts'
import { useRegenerateProfileContextSection } from '@/features/profile-context/hooks/useRegenerateProfileContextSection'

/**
 * #2908 (#2010.16 / #2011.10) — « Régénérer cette section ». UN SEUL composant
 * générique, paramétré par section (`welcomeSummary` | `coachingInsights`),
 * jamais un bouton dédié par section — même esprit que `CorrectRecapButton`
 * (doctrine c75).
 */
export function RegenerateSectionButton({ section }: { section: ProfileContextRegenerableSection }) {
  const { t } = useTranslation('profile')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const regenerate = useRegenerateProfileContextSection()

  const handleConfirm = () => {
    setConfirmOpen(false)
    regenerate.mutate(section, {
      onSuccess: () => toast.success(t('context.regenerateSection.toastSuccess')),
      onError: () => toast.error(t('context.regenerateSection.toastError')),
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={RefreshCw}
        iconPosition="left"
        isLoading={regenerate.isPending}
        onClick={() => setConfirmOpen(true)}
        className="text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]"
      >
        {t('context.regenerateSection.cta')}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--bellum-text-primary)]">
              {t('context.regenerateSection.title')}
            </DialogTitle>
            <DialogDescription className="text-[var(--bellum-text-secondary)]">
              {t('context.regenerateSection.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="violet" size="sm" icon={RefreshCw} onClick={handleConfirm}>
              {t('context.regenerateSection.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
