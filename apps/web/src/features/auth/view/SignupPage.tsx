import { useTranslation } from 'react-i18next'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { AuthBrandingPanel } from '@/features/auth/components/AuthBrandingPanel'
import { SignupCard } from '@/features/auth/components/SignupCard'
import { useRedirectAfterAuth } from '@/features/auth/hooks/useRedirectAfterAuth'

export function SignupPage() {
  const { t } = useTranslation('auth')
  useRedirectAfterAuth()

  return (
    <AccessShell
      kicker={t('shell.kicker.signup')}
      title={t('signup.title')}
      lead={t('signup.subtitle')}
      aside={<AuthBrandingPanel />}
    >
      <SignupCard />
    </AccessShell>
  )
}
