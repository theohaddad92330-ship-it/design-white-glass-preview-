import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, MailCheck, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { resetPasswordSchema, type ResetPassword } from '@bellum/contracts'
import { Button, CardContent, FormField, Text } from '@bellum/ui'
import { useResetPassword } from '@/features/auth/hooks/useResetPassword'
import { AccessShell } from '@/features/auth/components/AccessShell'

const RESEND_COOLDOWN_SECONDS = 60

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [cooldown, setCooldown] = useState(0)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const intervalIdRef = useRef<number | null>(null)
  const mutation = useResetPassword()
  const form = useForm<ResetPassword>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { email: '' } })

  useEffect(
    () => () => {
      if (intervalIdRef.current !== null) window.clearInterval(intervalIdRef.current)
    },
    [],
  )

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS)
    if (intervalIdRef.current !== null) window.clearInterval(intervalIdRef.current)
    intervalIdRef.current = window.setInterval(() => {
      setCooldown(c => {
        const next = c - 1
        if (next <= 0 && intervalIdRef.current !== null) {
          window.clearInterval(intervalIdRef.current)
          intervalIdRef.current = null
        }
        return Math.max(next, 0)
      })
    }, 1000)
  }

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await mutation.mutateAsync(email)
      setSentTo(email)
      startCooldown()
      toast.success(t('forgotPassword.successToast'))
    } catch {
      toast.error(t('forgotPassword.errorToast'))
    }
  })

  const isCoolingDown = cooldown > 0
  const submitDisabled = form.formState.isSubmitting || isCoolingDown
  const submitLabel = isCoolingDown
    ? t('forgotPassword.submitCountdown', { seconds: cooldown })
    : t('forgotPassword.submit')

  return (
    <AccessShell
      kicker={t('shell.kicker.password')}
      title={t('forgotPassword.title')}
      lead={t('forgotPassword.subtitle')}
    >
      <div className="w-full max-w-md">
        <CardContent className="space-y-8 p-0">
          {sentTo ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--bellum-success)_35%,var(--bellum-border))] bg-[color-mix(in_srgb,var(--bellum-success)_8%,transparent)] p-3"
            >
              <MailCheck className="mt-0.5 size-4 shrink-0 text-[var(--success-soft-text)]" />
              <div className="min-w-0">
                <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {t('forgotPassword.sentTitle')}
                </Text>
                <Text size="xs" className="mt-0.5 break-all text-[var(--bellum-text-secondary)]">
                  {t('forgotPassword.sentBody', { email: sentTo })}
                </Text>
              </div>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormField
              label={t('forgotPassword.emailLabel')}
              error={form.formState.errors.email?.message}
              inputProps={{
                ...form.register('email'),
                type: 'email',
                autoComplete: 'email',
                placeholder: t('emailPlaceholder'),
                disabled: form.formState.isSubmitting || isCoolingDown,
              }}
            />
            <Button
              type="submit"
              variant="default"
              fullWidth
              isLoading={form.formState.isSubmitting}
              disabled={submitDisabled}
            >
              {submitLabel}
            </Button>
          </form>

          <div className="flex flex-col gap-4 border-t border-[var(--bellum-border)] pt-5">
            <div className="flex items-center gap-2 text-[var(--bellum-text-secondary)]">
              <ShieldCheck className="size-4 shrink-0 text-[var(--success-soft-text)]" />
              <Text size="xs">{t('forgotPassword.linkOnce')}</Text>
            </div>

            <Link
              to="/login"
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control px-2 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              <ArrowLeft className="size-4" />
              {t('backToLogin')}
            </Link>
          </div>
        </CardContent>
      </div>
    </AccessShell>
  )
}
