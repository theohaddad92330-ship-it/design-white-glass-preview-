import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bellum/ui'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useRegenerateProfileContext } from '@/features/profile-context/hooks/useRegenerateProfileContext'

type RegenerateContextButtonProps = {
  /** True while the backend generation is already running (status = generating). */
  isGenerating?: boolean
}

/**
 * « Régénérer mon contexte IA » — re-runs the profiler over the current ESN
 * answers. Overwrites the live context (a fresh revision is snapshotted, so it
 * stays reversible from the « Versions » panel) — confirmed at the click, with a
 * spinner while the mutation is in flight.
 */
export function RegenerateContextButton({ isGenerating = false }: RegenerateContextButtonProps) {
  const { t } = useTranslation('profile')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const regenerate = useRegenerateProfileContext()
  const isPending = regenerate.isPending || isGenerating

  const handleConfirm = () => {
    setConfirmOpen(false)
    regenerate.mutate(undefined, {
      onSuccess: () => toast.success(t('context.regenerate.toastStarted')),
      onError: () => toast.error(t('context.regenerate.toastError')),
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        icon={RefreshCw}
        iconPosition="left"
        isLoading={isPending}
        loadingText={t('context.generate.loading')}
        onClick={() => setConfirmOpen(true)}
      >
        {t('context.regenerate.cta')}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--bellum-text-primary)]">{t('context.regenerate.title')}</DialogTitle>
            <DialogDescription className="text-[var(--bellum-text-secondary)]">
              {t('context.regenerate.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="violet" size="sm" icon={RefreshCw} onClick={handleConfirm}>
              {t('context.regenerate.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
