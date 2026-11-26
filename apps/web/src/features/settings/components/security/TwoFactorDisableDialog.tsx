import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Text,
} from '@bellum/ui'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/features/auth/api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired once the factor has been removed. */
  onDisabled: () => void
}

const OTP_SLOT_CLASS =
  'h-12 w-10 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-lg text-[var(--bellum-text-primary)] data-[active=true]:border-[var(--bellum-primary-500)] data-[active=true]:ring-2 data-[active=true]:ring-[color-mix(in_srgb,var(--bellum-primary-500)_24%,transparent)]'

/** Confirms disabling 2FA by requiring a current TOTP code — prevents a
 *  hijacked session from silently dropping the second factor. */
export function TwoFactorDisableDialog({ open, onOpenChange, onDisabled }: Props) {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  // GA-235 — un `keyPrefix` neutralise le `namespace:` d'un `t('common:…')` :
  // second `t` sur le namespace commun, comme `DeleteAccountDialog.tsx`.
  const { t: tCommon } = useTranslation('common')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setCode('')
      setSubmitting(false)
    }
  }, [open])

  const submit = async (otp: string): Promise<void> => {
    setSubmitting(true)
    try {
      await authApi.mfaDisable(otp)
      toast.success(t('twoFactorDisableSuccessToast'))
      onDisabled()
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      toast.error(raw || t('twoFactorInvalidCode'))
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (next: string): void => {
    const cleaned = next.replace(/\D/g, '').slice(0, 6)
    setCode(cleaned)
    if (cleaned.length === 6 && !submitting) {
      void submit(cleaned)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('twoFactorDisableTitle')}</DialogTitle>
          <DialogDescription>{t('twoFactorDisableDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('twoFactorCodeLabel')}
          </Text>
          <InputOTP
            maxLength={6}
            value={code}
            onChange={handleChange}
            disabled={submitting}
            autoFocus
            containerClassName="gap-2"
          >
            <InputOTPGroup className="gap-2">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <InputOTPSlot key={i} index={i} className={OTP_SLOT_CLASS} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      </DialogContent>
    </Dialog>
  )
}
