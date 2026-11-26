import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useSession } from '@/lib/hooks/use-session'
import { useOnboardingStatus } from '@/features/profiles/hooks/useOnboardingStatus'
import { shouldStartFirstSuccessGuide } from './first-success-guide-trigger'
import { recordFirstSuccessGuideShown, wasFirstSuccessGuideShown } from './first-success-guide-seen'
import { GUIDE_REGISTRY, guideSessionFromDefinition } from './guide-registry'
import { useGuideStore } from './guide-store'

const FIRST_SUCCESS_GUIDE_ID = 'premier-succes-bellumai'

/**
 * #2214.23 — L'APPELANT RÉEL DU GUIDE 1 AUTOMATIQUE. Monté au root
 * (`routes/__root.tsx`, à côté de `GuideHost`) : ce composant ne rend RIEN,
 * il ne fait que démarrer le fil du store quand `shouldStartFirstSuccessGuide`
 * le dit — la même séparation jugement/effet que `GuideHost` applique déjà à
 * la résolution d'ancrage.
 */
export function FirstSuccessGuideTrigger() {
  const route = useRouterState({ select: state => state.location.pathname })
  const { user } = useSession()
  const { needsOnboarding } = useOnboardingStatus({ deferred: true })
  const session = useGuideStore(state => state.session)
  const start = useGuideStore(state => state.start)

  useEffect(() => {
    if (!user) return
    const alreadyShown = wasFirstSuccessGuideShown(user.id)
    if (!shouldStartFirstSuccessGuide({ route, needsOnboarding, alreadyShown, hasActiveGuideSession: !!session })) {
      return
    }
    const definition = GUIDE_REGISTRY.find(candidate => candidate.id === FIRST_SUCCESS_GUIDE_ID)
    if (!definition) return
    start(guideSessionFromDefinition(definition))
    recordFirstSuccessGuideShown(user.id)
  }, [route, needsOnboarding, session, start, user])

  return null
}
