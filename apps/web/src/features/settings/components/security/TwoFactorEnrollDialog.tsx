import { useEffect, useState } from 'react'
import type { MfaEnrollResponse } from '@bellum/contracts'
import {
  CopyField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Spinner,
  Text,
} from '@bellum/ui'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/features/auth/api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired once a code has been verified and the factor is active. */
  onEnabled: () => void
}

const OTP_SLOT_CLASS =
  'h-12 w-10 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-lg text-[var(--bellum-text-primary)] data-[active=true]:border-[var(--bellum-primary-500)] data-[active=true]:ring-2 data-[active=true]:ring-[color-mix(in_srgb,var(--bellum-primary-500)_24%,transparent)]'

/**
 * TOTP enrollment modal: fetch a fresh secret + QR (factor stays disabled),
 * let the user scan or copy it, then verify a 6-digit code to activate. A new
 * secret is generated each time the dialog opens.
 */
export function TwoFactorEnrollDialog({ open, onOpenChange, onEnabled }: Props) {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  // GA-235 — un `keyPrefix` neutralise le `namespace:` d'un `t('common:…')` :
  // second `t` sur le namespace commun, comme `DeleteAccountDialog.tsx`.
  const { t: tCommon } = useTranslation('common')
  const [enroll, setEnroll] = useState<MfaEnrollResponse | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!open) {
      setEnroll(null)
      setCode('')
      setVerifying(false)
      return
    }
    let cancelled = false
    authApi
      .mfaEnroll()
      .then(data => {
        if (!cancelled) setEnroll(data)
      })
      .catch(() => {
        if (cancelled) return
        toast.error(t('twoFactorEnrollStartError'))
        onOpenChange(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, onOpenChange, t])

  const submit = async (otp: string): Promise<void> => {
    setVerifying(true)
    try {
      await authApi.mfaVerify(otp)
      toast.success(t('twoFactorEnrollSuccessToast'))
      onEnabled()
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      toast.error(raw || t('twoFactorInvalidCode'))
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  const handleChange = (next: string): void => {
    const cleaned = next.replace(/\D/g, '').slice(0, 6)
    setCode(cleaned)
    if (cleaned.length === 6 && !verifying) {
      void submit(cleaned)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('twoFactorEnrollTitle')}</DialogTitle>
          <DialogDescription>{t('twoFactorEnrollDescription')}</DialogDescription>
        </DialogHeader>

        {!enroll ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex justify-center">
              <img
                src={enroll.qrDataUrl}
                alt={t('twoFactorEnrollQrAlt')}
                className="h-44 w-44 rounded-lg bg-white p-2"
              />
            </div>

            <div className="space-y-1.5">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('twoFactorEnrollManualKeyLabel')}
              </Text>
              <CopyField value={enroll.secret} />
            </div>

            <div className="space-y-2">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('twoFactorCodeLabel')}
              </Text>
              <InputOTP
                maxLength={6}
                value={code}
                onChange={handleChange}
                disabled={verifying}
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
