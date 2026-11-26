import { useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { VerifyEmailCard } from '@/features/auth/components/VerifyEmailCard'

export function VerifyEmailPage() {
  const { t } = useTranslation('auth')
  const { id, email } = useSearch({ from: '/verify-email' })

  return (
    <AccessShell kicker={t('shell.kicker.verify')} title={t('verifyEmail.title')} lead={t('verifyEmail.subtitle')}>
      <VerifyEmailCard userId={id} email={email ?? ''} />
    </AccessShell>
  )
}
