import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOauthCallback } from '@/features/auth/hooks/useOauthCallback'
import { Button } from '@bellum/ui'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { GlobalLoadingState } from '@/components/GlobalLoadingState'

/**
 * Supabase redirects the Google OAuth flow back to `/auth/callback#access_token=...`.
 * All the heavy lifting (parsing the hash, handing tokens to the session
 * manager, fetching the profile, navigating on success) lives in
 * `useOauthCallback`. This component is just the view — loading or error —
 * dans la coque d'accès (en-tête `.ob23-heading`, carte), jamais un écran à part.
 */
export function AuthCallback() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const { isError } = useOauthCallback()

  if (isError) {
    return (
      <AccessShell kicker={t('shell.kicker.login')} title={t('callback.title')} lead={t('callback.message')}>
        <div role="alert" className="max-w-md space-y-6">
          <p className="text-sm text-[var(--bellum-text-secondary)]">{t('callback.hint')}</p>
          <Button variant="violet" icon={ArrowLeft} onClick={() => navigate({ to: '/login', replace: true })}>
            {t('backToLogin')}
          </Button>
        </div>
      </AccessShell>
    )
  }

  return (
    <AccessShell>
      <div className="text-center">
        <GlobalLoadingState />
      </div>
    </AccessShell>
  )
}
