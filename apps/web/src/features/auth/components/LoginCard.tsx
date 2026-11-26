import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { AuthDivider } from './AuthDivider'
import { EmailCodeLoginForm } from './EmailCodeLoginForm'
import { GoogleSignInButton } from './GoogleSignInButton'
import { LoginForm } from './LoginForm'
import { MfaChallengeForm } from './MfaChallengeForm'
import { useGoogleSignIn } from '@/features/auth/hooks/useGoogleSignIn'

type LoginMode = 'password' | 'otp'

export function LoginCard() {
  const { t } = useTranslation('auth')
  const google = useGoogleSignIn()
  // Set once a login (password OR email-code) comes back `mfa_required`; swaps the
  // form for the 6-digit TOTP step. `null` = normal login view.
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  // Toggle between the password form and the passwordless email-code form.
  const [mode, setMode] = useState<LoginMode>('password')

  const renderBody = () => {
    if (mfaToken) {
      return <MfaChallengeForm mfaToken={mfaToken} onCancel={() => setMfaToken(null)} />
    }
    if (mode === 'otp') {
      return <EmailCodeLoginForm onMfaRequired={setMfaToken} onCancel={() => setMode('password')} />
    }
    return (
      <>
        <GoogleSignInButton onClick={google.signIn} disabled={google.isLoading} isLoading={google.isLoading} />
        <AuthDivider />
        <LoginForm onMfaRequired={setMfaToken} />

        <Button type="button" variant="ghost" size="sm" fullWidth icon={Mail} onClick={() => setMode('otp')}>
          {t('login.emailCodeCta')}
        </Button>

        <Text element="p" size="sm" className="text-center text-[var(--bellum-text-secondary)]">
          {t('login.noAccount')}{' '}
          <Link
            to="/signup"
            className="font-medium text-[var(--bellum-text-primary)] transition-colors hover:text-[var(--bellum-text-accent)]"
          >
            {t('login.signUpLink')}
          </Link>
        </Text>
      </>
    )
  }

  // Le titre et la phrase de l'écran vivent dans l'en-tête de la coque (`.ob23-heading`) ;
  // la carte porte le formulaire, et les étapes code / double facteur leur propre h2.
  return <div className="w-full max-w-md space-y-6">{renderBody()}</div>
}
