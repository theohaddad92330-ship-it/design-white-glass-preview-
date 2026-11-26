import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import type { TFunction } from 'i18next'
import { Button, CardContent, PasswordField, Text } from '@bellum/ui'
import { InvalidLinkMessage, type InvalidLinkReason } from '@/components/organisms/invalid-link-message'
import { TemporaryFailureScreen } from '@/components/organisms/temporary-failure-screen'
import { sessionManager } from '@/features/auth/session-manager'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { landingRouteNow } from '@/features/preferences/preferences-provider'

function buildSchema(t: TFunction<'auth'>) {
  return z
    .object({ password: z.string().min(8, t('resetPassword.minLength')), confirmPassword: z.string().min(8) })
    .refine(v => v.password === v.confirmPassword, {
      message: t('resetPassword.passwordsMismatch'),
      path: ['confirmPassword'],
    })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

type ResetLink = {
  expiresAt: number
  signature: string
  tokenHash: string
}

export function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'invalid_link' | 'temporary_failure'>('idle')
  const [reason, setReason] = useState<InvalidLinkReason>('unknown')
  // Read `token_hash` from the query string — the recovery URL emitted by
  // the backend is `…/auth/reset-password?token_hash=…&type=recovery`
  // (no more hash fragment now that we bypass Supabase's `/verify`).
  const resetLink = useMemo(readResetLink, [])
  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      schema.parse(form.getValues())
      // Persists the session via cookies + sessionManager state, then
      // redirects straight to the dashboard — no extra login round-trip.
      if (!resetLink) {
        setStatus('invalid_link')
        return
      }
      await sessionManager.confirmResetPassword(resetLink.tokenHash, password, resetLink.expiresAt, resetLink.signature)
      // #1786 — une réinitialisation de mot de passe est une CONNEXION : elle
      // atterrit là où atterrit une connexion, pas sur un écran choisi en dur.
      await navigate({ to: landingRouteNow() })
    } catch (error) {
      // Le CODE d'abord : la prose ne dit pas laquelle des trois causes a eu
      // lieu, et c'est ce qui a rendu l'incident du 25/08 indiagnosticable. Le
      // repli sur le message reste pour un serveur antérieur au déploiement qui
      // n'envoie pas encore de code.
      const code = (error as { code?: string } | null)?.code
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (code === 'reset_token_expired' || (!code && /expired|expir/.test(message))) {
        setReason('expired')
        setStatus('invalid_link')
        return
      }
      if (
        code === 'reset_token_invalid' ||
        (!code && /invalide|invalid|already|utilisé|unauthorized|401/.test(message))
      ) {
        setReason('used')
        setStatus('invalid_link')
        return
      }
      if (code === 'password_update_failed') {
        // Le lien a MARCHÉ — c'est le mot de passe que le fournisseur refuse.
        // Renvoyer vers « demande un nouveau lien » ferait tourner en rond.
        setReason('password_rejected')
        setStatus('invalid_link')
        return
      }
      setStatus('temporary_failure')
    }
  })

  if (!resetLink || resetLink.expiresAt <= Date.now() || status === 'invalid_link') {
    // Une échéance NÔTRE déjà passée est une expiration, pas un lien cassé :
    // le dire évite d'envoyer chercher un problème qui n'existe pas.
    const shown: InvalidLinkReason = status === 'invalid_link' ? reason : resetLink ? 'expired' : 'unknown'
    return <InvalidLinkMessage reason={shown} />
  }

  if (status === 'temporary_failure') {
    return <TemporaryFailureScreen />
  }

  return (
    <AccessShell
      kicker={t('shell.kicker.password')}
      title={t('resetPassword.title')}
      lead={t('resetPassword.subtitle')}
    >
      <div className="w-full max-w-md">
        <CardContent className="space-y-8 p-0">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <PasswordField
              label={t('resetPassword.newPasswordLabel')}
              error={form.formState.errors.password?.message}
              inputProps={{ ...form.register('password'), type: 'password', autoComplete: 'new-password' }}
            />

            <PasswordField
              label={t('resetPassword.confirmPasswordLabel')}
              error={form.formState.errors.confirmPassword?.message}
              inputProps={{ ...form.register('confirmPassword'), type: 'password', autoComplete: 'new-password' }}
            />

            <Button
              type="submit"
              variant="default"
              fullWidth
              isLoading={form.formState.isSubmitting}
              disabled={!resetLink}
            >
              {t('resetPassword.submit')}
            </Button>
          </form>

          <div className="flex flex-col gap-4 border-t border-[var(--bellum-border)] pt-5">
            <div className="flex items-center gap-2 text-[var(--bellum-text-secondary)]">
              <ShieldCheck className="size-4 shrink-0 text-[var(--success-soft-text)]" />
              <Text size="xs">{t('resetPassword.appliedNote')}</Text>
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

function readResetLink(): ResetLink | null {
  const query = new URLSearchParams(window.location.search)
  const tokenHash = query.get('token_hash') ?? ''
  const signature = query.get('signature') ?? ''
  const expiresAt = Number(query.get('expires_at'))

  if (!tokenHash || !/^[a-f0-9]{64}$/.test(signature) || !Number.isSafeInteger(expiresAt)) return null
  return { tokenHash, signature, expiresAt }
}
