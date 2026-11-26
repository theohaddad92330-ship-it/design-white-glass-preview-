import { useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { AuthBrandingPanel } from '@/features/auth/components/AuthBrandingPanel'
import { useBrand } from '@/features/brand/brand-context'

/**
 * L'entrée `/` sans session, dans la coque d'accès (`onboarding-accueil`) :
 * la marque en surtitre, la promesse en h1, les deux phrases dessous, les deux
 * gestes dans la carte et l'itinéraire 01-03 à côté.
 */
export function InviteToLoginPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const brand = useBrand()
  return (
    <AccessShell
      kicker={brand.name}
      title={t('inviteToLogin.message')}
      lead={
        <>
          {t('inviteToLogin.sub1')} {t('inviteToLogin.sub2')}
        </>
      }
      aside={<AuthBrandingPanel />}
    >
      <div className="flex max-w-md flex-col gap-3">
        <Button variant="violet" icon={ArrowRight} iconPosition="right" onClick={() => navigate({ to: '/login' })}>
          {t('inviteToLogin.signIn')}
        </Button>
        <Button variant="outline" onClick={() => navigate({ to: '/signup' })}>
          {t('inviteToLogin.signUp')}
        </Button>
      </div>
    </AccessShell>
  )
}
