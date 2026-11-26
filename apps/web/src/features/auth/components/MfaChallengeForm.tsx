import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button, InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot, Text } from '@bellum/ui'
import { sessionManager } from '@/features/auth/session-manager'

type Props = {
  mfaToken: string
  onCancel: () => void
}

const OTP_SLOT_CLASS =
  'h-14 w-12 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-lg text-[var(--bellum-text-primary)] data-[active=true]:border-[var(--bellum-primary-500)] data-[active=true]:ring-2 data-[active=true]:ring-[color-mix(in_srgb,var(--bellum-primary-500)_24%,transparent)]'

const INVALID_REGEX = /invalide|expir/i

function toChallengeError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (INVALID_REGEX.test(raw)) return raw
  return fallback
}

/**
 * Second login step for accounts with TOTP 2FA. Collects the 6-digit code and
 * exchanges it (with the pending `mfaToken`) for a real session. On success the
 * session manager applies it and `useRedirectAfterAuth` navigates away — nothing
 * to do here beyond clearing the local error state.
 */
export function MfaChallengeForm({ mfaToken, onCancel }: Props) {
  const { t } = useTranslation('auth')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (otp: string): Promise<void> => {
    setSubmitting(true)
    try {
      await sessionManager.challengeMfa(mfaToken, otp)
      // Success: session applied; the redirect hook takes over.
    } catch (err) {
      toast.error(toChallengeError(err, t('genericRetryError')))
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
    <div className="space-y-6">
      <header className="space-y-2">
        <Text element="h2" size="2xl" weight="semibold" className="tracking-tight text-[var(--bellum-text-primary)]">
          {t('mfa.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('mfa.subtitle')}
        </Text>
      </header>

      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={handleChange}
          disabled={submitting}
          autoFocus
          containerClassName="gap-3"
        >
          <InputOTPGroup className="gap-2">
            {[0, 1, 2].map(i => (
              <InputOTPSlot key={i} index={i} className={OTP_SLOT_CLASS} />
            ))}
          </InputOTPGroup>
          <InputOTPSeparator className="text-[var(--bellum-text-primary)]" />
          <InputOTPGroup className="gap-2">
            {[3, 4, 5].map(i => (
              <InputOTPSlot key={i} index={i} className={OTP_SLOT_CLASS} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="text-center">
        <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} onClick={onCancel} disabled={submitting}>
          {t('mfa.backToLogin')}
        </Button>
      </div>
    </div>
  )
}
