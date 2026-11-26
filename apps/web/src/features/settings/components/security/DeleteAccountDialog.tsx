import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { toast } from 'sonner'
import { Trans, useTranslation } from 'react-i18next'
import { useDeletePrivacyAccount } from '@/features/settings/hooks/useDeletePrivacyAccount'

/** The exact phrase the user must type — must match the server's DTO literal (never translated). */
const CONFIRM_PHRASE = 'SUPPRIMER'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Confirms irreversible account deletion (RGPD art. 17). The destructive button
 * unlocks only once the user types the exact `SUPPRIMER` phrase; the server
 * enforces the same literal, so a mistyped value is rejected regardless.
 */
export function DeleteAccountDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  const { t: tCommon } = useTranslation('common')
  const [value, setValue] = useState('')
  const del = useDeletePrivacyAccount()

  useEffect(() => {
    if (!open) setValue('')
  }, [open])

  const canConfirm = value.trim() === CONFIRM_PHRASE && !del.isPending

  async function handleConfirm(): Promise<void> {
    if (!canConfirm) return
    try {
      const summary = await del.mutateAsync(CONFIRM_PHRASE)
      // #1939.9 — ce que l'effacement a fait de la voix, dit seulement quand il y
      // a quelque chose à dire : jamais « 0 enregistrement », et rien du tout
      // quand une API antérieure au champ ne le sert pas.
      const erased = summary?.voiceMessages?.erased
      const deferred = summary?.voiceMessages?.deferredToNextPurge
      const voiceLines = [
        ...(typeof erased === 'number' && erased > 0 ? [t('deleteAccountVoiceErased', { count: erased })] : []),
        ...(typeof deferred === 'number' && deferred > 0 ? [t('deleteAccountVoiceDeferred', { count: deferred })] : []),
      ]
      toast.success(
        t('deleteAccountSuccessToast'),
        voiceLines.length > 0 ? { description: voiceLines.join(' ') } : undefined,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deleteAccountErrorToast'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('deleteAccountTitle')}</DialogTitle>
          <DialogDescription>
            <Trans
              t={t}
              i18nKey="deleteAccountDescription"
              values={{ phrase: CONFIRM_PHRASE }}
              components={{ phrase: <span className="font-semibold text-[var(--bellum-text-primary)]" /> }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('deleteAccountConfirmationLabel')}
          </Text>
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoFocus
            disabled={del.isPending}
            aria-label={t('deleteAccountConfirmationAria')}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            isLoading={del.isPending}
            loadingText={t('deleteAccountDeleting')}
          >
            {t('deleteAccountConfirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
