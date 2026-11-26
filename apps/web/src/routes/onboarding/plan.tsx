import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { creditsApi } from '@/features/credits/api'
import { onboardingApi } from '@/features/onboarding/api'
import { readOnboardingStateOrUnknown } from '@/features/onboarding/lib/guard-state'
import { resolvePlanScreen } from '@/features/onboarding/lib/onboarding-gate'
import { OnboardingPlanPage } from '@/features/onboarding/view/OnboardingPlanPage'

/**
 * `/onboarding/plan` — par quoi commencer, AVANT le questionnaire.
 *
 * Cet écran s'adresse à un compte NEUF. Un compte déjà installé ne doit jamais le
 * voir : on lui demanderait de choisir un palier qu'il a déjà, ou pire, de
 * « commencer » alors qu'il travaille depuis des semaines. Le signal fiable est le
 * palier courant — `decouverte` est celui que le trigger de signup pose, donc tout
 * autre valeur (essai accordé, plan payant, beta) veut dire « ce compte a déjà été
 * servi ».
 *
 * Une lecture de crédits qui ÉCHOUE n'est pas un compte neuf : elle renvoie au
 * tableau de bord. L'inverse (afficher l'écran « au cas où ») demandait à un
 * abonné de choisir une offre qu'il paie déjà, dès qu'un 429 passait par là.
 */
export const Route = createFileRoute('/onboarding/plan')({
  beforeLoad: async () => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })

    // Même règle que pour la lecture de crédits juste en dessous : un état
    // illisible n'interrompt pas l'onboarding, il affiche l'écran.
    const state = await readOnboardingStateOrUnknown(() => onboardingApi.getState())

    let creditsUnknown = false
    const credits = await creditsApi.getMine().catch(() => {
      creditsUnknown = true
      return null
    })
    const destination = resolvePlanScreen({ status: state?.status, credits, creditsUnknown })
    if (destination !== 'show') throw redirect({ to: destination })
  },
  component: OnboardingPlanPage,
})
