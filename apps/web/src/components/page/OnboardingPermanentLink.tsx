import { Button } from '@bellum/ui'
import { ClipboardList } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { isAwaitingAdmin } from '@/features/onboarding/lib/awaiting-admin'
import { canSeeOnboardingLink } from '@/features/onboarding/lib/onboarding-link-access'
import { useReconfigureOnboarding } from '@/features/profile/hooks/useReconfigureOnboarding'

/**
 * #4364.2 — le chemin PERMANENT vers le questionnaire, depuis l'accueil, qui ne dépend d'AUCUN drapeau.
 *
 * Avant : le seul chemin était `OnboardingRefreshBanner` (conditionnel : `refresh_required` après un premier
 * onboarding terminé). Reporté ou jamais fini, rien (#4364.1). Le bandeau RESTE ; ce lien s'ajoute à côté.
 *
 * Qui le voit : `canSeeOnboardingLink` (droits dits et refus prouvés, sans élargissement). Le geste :
 *  - onboarding terminé → le geste existant (`useReconfigureOnboarding`, un seul déclencheur, GA-26), car
 *    `/onboarding` y renvoie chez Laura ;
 *  - reporté ou jamais fini → `/onboarding` directement : rien n'est écrit.
 */
export function OnboardingPermanentLink() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { data: state } = useOnboardingState()
  const { data: credits } = useCredits()
  const { trigger } = useReconfigureOnboarding()
  const [busy, setBusy] = useState(false)

  const visible = canSeeOnboardingLink({
    status: state?.status,
    isDemo: credits?.is_demo === true,
    awaitingCompanyAdmin: isAwaitingAdmin(state),
  })
  if (!visible) return null

  const finished = state?.status === 'completed' || state?.status === 'activated'
  const open = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (finished) await trigger()
      else void navigate({ to: '/onboarding' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex px-4 py-1 md:px-6">
      <Button
        type="button"
        variant="plain"
        size="sm"
        disabled={busy}
        onClick={() => void open()}
        className="h-auto min-h-11 gap-2 text-[var(--bellum-text-muted)]"
      >
        <ClipboardList aria-hidden="true" className="h-4 w-4" />
        {t('onboardingPermanentLink.label')}
      </Button>
    </div>
  )
}
