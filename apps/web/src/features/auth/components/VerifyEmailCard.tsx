import { Link } from '@tanstack/react-router'
import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { VerifyEmailForm } from './VerifyEmailForm'

type Props = {
  userId: string
  email: string
}

/**
 * La carte de vérification dans la coque d'accès : l'adresse visée, le code à
 * six chiffres, puis sous un filet le conseil et « Mauvais email ? ».
 */
export function VerifyEmailCard({ userId, email }: Props) {
  const { t } = useTranslation('auth')
  return (
    <div className="w-full max-w-md space-y-8">
      {/* Le titre et la phrase vivent dans l'en-tête de la coque ; la carte nomme l'adresse visée. */}
      <Text
        element="p"
        size="sm"
        weight="semibold"
        className="w-fit rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-1.5 text-[var(--bellum-text-primary)]"
      >
        {email}
      </Text>

      <VerifyEmailForm userId={userId} />

      <div className="space-y-4 border-t border-[var(--bellum-border)] pt-5">
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('verifyEmail.tip')}
        </Text>

        <div className="inline-flex min-h-11 items-center gap-2 text-[var(--bellum-text-secondary)]">
          <MessageCircle className="h-4 w-4" aria-hidden />
          <Link
            to="/signup"
            className="text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-4 transition-colors hover:text-[var(--bellum-text-accent)] hover:underline dark:text-[var(--bellum-text-accent)] dark:hover:text-[var(--bellum-text-accent)]"
          >
            {t('verifyEmail.wrongEmail')}
          </Link>
        </div>
      </div>
    </div>
  )
}
