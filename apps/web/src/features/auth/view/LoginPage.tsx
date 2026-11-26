import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { AuthBrandingPanel } from '@/features/auth/components/AuthBrandingPanel'
import { LoginCard } from '@/features/auth/components/LoginCard'
import { useCloseDemoOnLogin } from '@/features/auth/hooks/useCloseDemoOnLogin'
import { useRedirectAfterAuth } from '@/features/auth/hooks/useRedirectAfterAuth'

export function LoginPage() {
  const { t } = useTranslation('auth')
  // #3788.1 — une session démo encore posée est fermée avant que le rebond ne
  // la rouvre. `closing` seul (via `enabled`) ne suffit pas : la fermeture est
  // asynchrone, et une vraie connexion soumise PENDANT ce laps pouvait réussir
  // puis être écrasée quand la fermeture se terminait ensuite (`qc.clear()`
  // après coup). Tant que `closing` est vrai, le formulaire n'est même pas
  // montré — aucune tentative de vraie connexion n'est possible avant que la
  // démo soit réellement fermée.
  // #5024 — `checking` : le serveur n'a pas encore dit si la session posée est une démo ; ni rebond ni formulaire.
  const { closing, checking } = useCloseDemoOnLogin()
  useRedirectAfterAuth({ enabled: !closing && !checking })

  // Inscription démo : la page défile (retour prospect 29/09)
  return (
    <AccessShell
      kicker={t('shell.kicker.login')}
      title={t('login.title')}
      lead={t('login.subtitle')}
      aside={<AuthBrandingPanel />}
    >
      {/* #3788.3 — le formulaire n'existe pas tant que la fermeture n'est
       * pas terminée : une vraie connexion soumise PENDANT la fermeture
       * (encore un appel réseau en vol, `/auth/logout`) courait contre
       * elle, et la fermeture, en résolvant plus tard, écrasait la
       * session réelle tout juste posée. La session démo doit être
       * fermée AVANT que la vraie connexion puisse même être tentée. */}
      {closing ? (
        <ScreenState state="loading" title={t('login.closingDemoTitle')} message={t('login.closingDemoBody')} />
      ) : checking ? (
        <ScreenState state="loading" title={t('login.checkingSessionTitle')} />
      ) : (
        <LoginCard />
      )}
    </AccessShell>
  )
}
