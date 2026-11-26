import { Button } from '@bellum/ui'
import { ClipboardList } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useOnboardingState, useSkipOnboarding } from '@/features/onboarding/hooks/useOnboarding'
import { shouldShowOnboardingRefreshBanner } from '@/features/onboarding/lib/onboarding-gate'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { Banner, bannerActionClassName } from '@/components/layout/Banner'

/**
 * #2021 — DÉCISION LOUIS 08/10/2026 (QCM), RENVERSE #2572 pour ce seul cas.
 *
 * Avant : un utilisateur DÉJÀ onboardé qui cliquait « Revoir ce questionnaire
 * en mode guidé » (Réglages › Profil) puis « Compléter mon profil » se
 * retrouvait avec `status: 'refresh_required'` — et `needsOnboarding`
 * redirigeait de force `/accounts`/`/search`/toute page cliente vers
 * `/onboarding`, tant qu'aucun « Plus tard » n'était cliqué. Quelqu'un qui
 * voulait juste consulter son dossier entre deux sous-étapes restait coincé.
 *
 * Maintenant : `needsOnboarding` ne redirige plus ce cas précis (voir son
 * docblock, `onboarding-gate.ts`) — ce bandeau discret le remplace, monté
 * dans `CustomerPageContent` (le chrome commun à toute page cliente, GA-26 :
 * un réglage vit à un seul endroit). « Reprendre » rouvre `/onboarding` (même
 * destination que `useReconfigureOnboarding`, les réponses précédentes sont
 * conservées) ; « Plus tard » appelle le MÊME geste de report que le reste du
 * produit (`useSkipOnboarding`, `POST /onboarding/skip`) — pas un état
 * d'écran séparé : ce même report fait aussi disparaître le bandeau de
 * reprise de l'écran `/onboarding` lui-même, un seul `skipped_at`, jamais
 * deux mémoires d'un même geste.
 *
 * `shouldShowOnboardingRefreshBanner` est l'image en miroir de
 * `needsOnboarding` : jamais en démo (aucune reconfiguration réelle n'y est
 * demandée), jamais après un report, jamais pour un utilisateur qui n'a
 * JAMAIS terminé l'onboarding (lui reste redirigé, comme avant).
 */
export const OnboardingRefreshBanner = memo(function OnboardingRefreshBanner() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { data: state } = useOnboardingState()
  const { data: credits } = useCredits()
  const skip = useSkipOnboarding()
  const [resuming, setResuming] = useState(false)

  const visible = shouldShowOnboardingRefreshBanner({
    status: state?.status,
    credits,
    skippedAt: state?.skipped_at ?? null,
    firstCompletedAt: state?.first_completed_at ?? null,
  })
  if (!visible) return null

  const resume = () => {
    if (resuming) return
    setResuming(true)
    void navigate({ to: '/onboarding' })
  }
  const later = () => {
    void skip.mutateAsync().catch(() => {
      // Best-effort, même doctrine que `WelcomeRedesignBanner` : un échec de
      // mémorisation ne bloque pas le geste de fermeture côté écran, il
      // revient au pire au prochain chargement de l'état.
    })
  }

  return (
    <Banner
      tone="accent"
      icon={ClipboardList}
      title={t('onboardingRefreshBanner.title')}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={later} disabled={skip.isPending}>
            {t('onboardingRefreshBanner.laterButton')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resume}
            disabled={resuming}
            className={bannerActionClassName('accent')}
          >
            {t('onboardingRefreshBanner.resumeButton')}
          </Button>
        </>
      }
    >
      {t('onboardingRefreshBanner.body')}
    </Banner>
  )
})
