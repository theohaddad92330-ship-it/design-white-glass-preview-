import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { AuthDivider } from './AuthDivider'
import { GoogleSignInButton } from './GoogleSignInButton'
import { SignupForm } from './SignupForm'
import { useGoogleSignIn } from '@/features/auth/hooks/useGoogleSignIn'

export function SignupCard() {
  const { t } = useTranslation('auth')
  const google = useGoogleSignIn()

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="space-y-6">
        <GoogleSignInButton onClick={google.signIn} disabled={google.isLoading} isLoading={google.isLoading} />
        <AuthDivider />
        <SignupForm />
      </div>

      <Text element="p" size="sm" className="text-center text-[var(--bellum-text-secondary)]">
        {t('signup.alreadyAccount')}{' '}
        <Link
          to="/login"
          className="font-medium text-[var(--bellum-text-accent)] transition-colors hover:text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)] dark:hover:text-[var(--bellum-text-accent)]"
        >
          {t('signup.signInLink')}
        </Link>
      </Text>
    </div>
  )
}
