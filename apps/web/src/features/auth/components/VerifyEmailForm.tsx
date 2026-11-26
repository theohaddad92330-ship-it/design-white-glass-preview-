import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { OTP_CODE_EXPIRATION_MINUTES } from '@bellum/contracts'
import { Button, InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot, Text } from '@bellum/ui'
import { useResendEmailOtp } from '@/features/auth/hooks/useResendEmailOtp'
import { useVerifyEmailOtp } from '@/features/auth/hooks/useVerifyEmailOtp'
import { useCountdown } from '@/lib/hooks/use-countdown'

type Props = {
  userId: string
}

const RESEND_COOLDOWN_SECONDS = 60

const INVALID_REGEX = /code (invalide|expir)|invalide|expir/i
const THROTTLE_REGEX = /patient|throttle/i
const OTP_SLOT_CLASS =
  'h-14 w-12 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-lg text-[var(--bellum-text-primary)] data-[active=true]:border-[var(--bellum-primary-500)] data-[active=true]:ring-2 data-[active=true]:ring-[color-mix(in_srgb,var(--bellum-primary-500)_24%,transparent)]'

function toVerifyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (INVALID_REGEX.test(raw)) return raw
  return fallback
}

export function VerifyEmailForm({ userId }: Props) {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const verify = useVerifyEmailOtp()
  const resend = useResendEmailOtp()
  const cooldown = useCountdown()

  const submit = (otp: string): void => {
    verify.mutate(
      { userId, code: otp },
      {
        onSuccess: () => {
          toast.success(t('verifyEmail.verified'))
          navigate({ to: '/onboarding', replace: true })
        },
        onError: err => {
          toast.error(toVerifyError(err, t('genericRetryError')))
          setCode('')
        },
      },
    )
  }

  const handleChange = (next: string): void => {
    const cleaned = next
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase()
    setCode(cleaned)
    if (cleaned.length === 6 && !verify.isPending) {
      submit(cleaned)
    }
  }

  const handleResend = (): void => {
    if (cooldown.isActive || resend.isPending) return
    resend.mutate(userId, {
      onSuccess: () => {
        toast.success(t('verifyEmail.newCodeSent'))
        cooldown.start(RESEND_COOLDOWN_SECONDS)
      },
      onError: err => {
        const raw = err instanceof Error ? err.message : ''
        if (THROTTLE_REGEX.test(raw)) cooldown.start(RESEND_COOLDOWN_SECONDS)
        toast.error(raw || t('verifyEmail.resendError'))
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={handleChange}
          disabled={verify.isPending}
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

      <Text element="p" size="xs" className="text-center text-[var(--bellum-text-secondary)]">
        {t('verifyEmail.expiration', { minutes: OTP_CODE_EXPIRATION_MINUTES })}
      </Text>

      <div className="text-center">
        <Button
          type="button"
          onClick={handleResend}
          disabled={cooldown.isActive || resend.isPending}
          variant="secondary"
        >
          {cooldown.isActive ? t('resendCodeCountdown', { seconds: cooldown.value }) : t('resendCode')}
        </Button>
      </div>
    </div>
  )
}
