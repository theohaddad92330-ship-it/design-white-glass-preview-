import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { requestOtpSchema } from '@bellum/contracts'
import { Button, FormField, InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot, Text } from '@bellum/ui'
import { sessionManager } from '@/features/auth/session-manager'
import { useCountdown } from '@/lib/hooks/use-countdown'

type Props = {
  /** Bubble up the pending 2FA token so the card can show the code step — an
   *  account with TOTP is challenged even when it signs in with an email code. */
  onMfaRequired: (mfaToken: string) => void
  /** Return to the password login view. */
  onCancel: () => void
}

const RESEND_COOLDOWN_SECONDS = 60
const OTP_SLOT_CLASS =
  'h-14 w-12 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-lg text-[var(--bellum-text-primary)] data-[active=true]:border-[var(--bellum-primary-500)] data-[active=true]:ring-2 data-[active=true]:ring-[color-mix(in_srgb,var(--bellum-primary-500)_24%,transparent)]'

const INVALID_REGEX = /invalide|expir|6 chiffres/i

function toVerifyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (INVALID_REGEX.test(raw)) return raw
  return fallback
}

/**
 * Passwordless sign-in ("recevoir un code par email"). Two steps: collect the
 * email → POST /auth/request-otp, then collect the 6-digit code → POST
 * /auth/verify-otp. On success the session manager applies the session and
 * `useRedirectAfterAuth` navigates away; a 2FA account is handed up via
 * `onMfaRequired` so the card shows the same TOTP challenge as a password login.
 */
export function EmailCodeLoginForm({ onMfaRequired, onCancel }: Props) {
  const { t } = useTranslation('auth')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const cooldown = useCountdown()

  const sendCode = async (): Promise<void> => {
    const parsed = requestOtpSchema.safeParse({ email })
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? t('emailCode.invalidEmail'))
      return
    }
    setEmailError(null)
    setSending(true)
    try {
      await sessionManager.requestOtp(parsed.data.email)
      setStep('code')
      setCode('')
      cooldown.start(RESEND_COOLDOWN_SECONDS)
      // Deliberately non-committal: never reveals whether the account exists.
      toast.success(t('emailCode.codeSent'))
    } catch {
      toast.error(t('emailCode.sendError'))
    } finally {
      setSending(false)
    }
  }

  const verify = async (otp: string): Promise<void> => {
    setVerifying(true)
    try {
      const outcome = await sessionManager.verifyOtp(email, otp)
      if (outcome.status === 'mfa_required') {
        onMfaRequired(outcome.mfaToken)
        return
      }
      // 'authenticated' → session applied; the redirect hook takes over.
    } catch (err) {
      toast.error(toVerifyError(err, t('genericRetryError')))
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  // Le code du produit contient des LETTRES (alphabet sans caractères
  // confondables). Ce champ ne gardait que les chiffres : une saisie correcte
  // devenait insaisissable dès qu'elle en comportait une. Même nettoyage que
  // l'écran de vérification d'inscription — c'est le même code.
  const handleCodeChange = (next: string): void => {
    const cleaned = next
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6)
    setCode(cleaned)
    if (cleaned.length === 6 && !verifying) void verify(cleaned)
  }

  const handleResend = (): void => {
    if (cooldown.isActive || sending) return
    void sendCode()
  }

  if (step === 'email') {
    return (
      <form
        onSubmit={e => {
          e.preventDefault()
          void sendCode()
        }}
        className="space-y-4"
        noValidate
      >
        <header className="space-y-2">
          <Text element="h2" size="2xl" weight="semibold" className="tracking-tight text-[var(--bellum-text-primary)]">
            {t('emailCode.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('emailCode.subtitle')}
          </Text>
        </header>

        <FormField
          label={t('emailLabel')}
          error={emailError ?? undefined}
          inputProps={{
            value: email,
            onChange: e => setEmail(e.target.value),
            type: 'email',
            placeholder: t('emailPlaceholder'),
            autoComplete: 'email',
            disabled: sending,
          }}
        />

        <Button
          type="submit"
          variant="violet"
          size="default"
          fullWidth
          icon={ArrowRight}
          iconPosition="right"
          isLoading={sending}
          loadingText={t('emailCode.submitLoading')}
          disabled={sending}
        >
          {t('emailCode.submit')}
        </Button>

        <div className="text-center">
          <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} onClick={onCancel} disabled={sending}>
            {t('emailCode.usePassword')}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Text element="h2" size="2xl" weight="semibold" className="tracking-tight text-[var(--bellum-text-primary)]">
          {t('emailCode.codeTitle')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('emailCode.codeSubtitle', { email })}
        </Text>
      </header>

      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={handleCodeChange}
          disabled={verifying}
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

      <div className="flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={handleResend}
          disabled={cooldown.isActive || sending || verifying}
        >
          {cooldown.isActive ? t('resendCodeCountdown', { seconds: cooldown.value }) : t('resendCode')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={ArrowLeft}
          onClick={() => {
            setStep('email')
            setCode('')
          }}
          disabled={verifying}
        >
          {t('emailCode.changeEmail')}
        </Button>
      </div>
    </div>
  )
}
