import { useEffect, useRef } from 'react'
import { useCompleteOnboarding, useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { useGenerateProfileContext } from '@/features/profile-context/hooks/useGenerateProfileContext'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import {
  ONBOARDING_GENERATING_SCREEN,
  ONBOARDING_QUESTION_SCREEN,
  ONBOARDING_QUESTIONNAIRE_ACTION,
} from '@/features/onboarding/lib/tracking'
import { trackActionCompleted, trackErrorShown, trackOnboardingAuditGenerated } from '@/lib/product-tracker'
import {
  derivePhaseStatuses,
  GENERATION_PHASES,
  type GenerationPhaseCode,
  type GenerationPhaseStatus,
} from '@/features/onboarding/lib/onboarding-generation-phases'

/** Même union que le statut de mutation react-query (`'idle'|'pending'|'success'|'error'`,
 *  cf. `onboarding-generation-phases.ts`) : structurellement compatible, jamais importée
 *  pour rester non exportée là-bas. */
type StepState = 'idle' | 'pending' | 'success' | 'error'

/** Le statut PERSISTÉ (`GET /profile-context/me`) — la seule source qui
 *  survit à un démontage, contrairement à `complete.status`/`generateProfile.status`
 *  qui repartent à `'idle'` à chaque nouvelle instance de composant. */
type ProfileContextStatus = 'not_generated' | 'generating' | 'succeeded' | 'validated' | 'failed'

/**
 * #2012.13 — dérive l'étape « génération du profil » depuis le statut
 * SERVEUR quand aucune mutation n'a encore été lancée DANS CE montage
 * (`generateProfile.status === 'idle'`) : reprendre un travail en cours,
 * montrer un résultat déjà là, ou nommer un échec — jamais relancer.
 */
function buildStepFromServer(status: ProfileContextStatus | undefined, verifyDone: boolean): StepState {
  if (status === 'generating') return 'pending'
  if (status === 'succeeded' || status === 'validated') return 'success'
  if (status === 'failed') return 'error'
  // `'not_generated'` (ou pas encore chargé). Si la vérification est déjà
  // posée côté serveur et qu'aucune génération n'a pourtant jamais été
  // enregistrée, la reprise automatique doit s'arrêter tout de même — même
  // affordance que l'échec (bouton « Réessayer ») plutôt qu'un blocage muet.
  return verifyDone ? 'error' : 'idle'
}

/**
 * #2089.28-.36 — l'écran de génération dédié. Reprend EXACTEMENT
 * l'enchaînement déjà posé par `useGenerateAudit` (#2030.16) — compléter,
 * tracker, générer le profil — mais expose les DEUX étapes séparément pour
 * que l'écran puisse nommer la phase en échec et ne relancer QU'ELLE
 * (#2089.35), plutôt que rejouer tout le parcours depuis le début.
 *
 * #2012.13 — quitter cet écran puis y revenir AVANT d'avoir validé ne doit
 * jamais relancer une génération complète : « rien de coûteux ne repart sans
 * un geste ». Le `useRef` ci-dessous n'empêche que le double montage React
 * (StrictMode) DANS la même visite — il repart à zéro à chaque démontage. Ce
 * qui empêche vraiment le rejeu, c'est l'état SERVEUR (`useOnboardingState`
 * + `useProfileContext`), qui, lui, survit à un aller-retour de route :
 * vérification déjà complétée, génération déjà en cours ou déjà terminée →
 * aucune mutation n'est rejouée. Tant que cet état n'est pas connu (requête
 * en cours ou en échec), rien ne part non plus : un `unknown` arrête la
 * reprise automatique, il ne la déclenche jamais.
 */
export function useGenerateAuditPhases(): {
  phases: Record<GenerationPhaseCode, GenerationPhaseStatus>
  failedPhase: GenerationPhaseCode | null
  succeeded: boolean
  retryVerify: () => void
  retryBuild: () => void
} {
  const complete = useCompleteOnboarding()
  const generateProfile = useGenerateProfileContext()
  const onboardingState = useOnboardingState()
  const profileContext = useProfileContext()
  const started = useRef(false)

  const verifyAlreadyDone = onboardingState.data?.status === 'completed'
  const profileStatus = profileContext.data?.status

  const runVerifyThenBuild = (): void => {
    complete.mutate(undefined, {
      onSuccess: () => {
        trackActionCompleted(ONBOARDING_QUESTIONNAIRE_ACTION, ONBOARDING_QUESTION_SCREEN)
        // #2085.7 — « audit généré » se pose sur LE succès de la génération,
        // pas sur celui de `complete` juste au-dessus (qui ne clôt que le
        // questionnaire) : voir `onSuccess` de `generateProfile.mutate` ci-dessous.
        generateProfile.mutate(undefined, {
          onSuccess: () => trackOnboardingAuditGenerated(ONBOARDING_GENERATING_SCREEN),
          onError: () => trackErrorShown(ONBOARDING_QUESTION_SCREEN, 'onboarding_review_generate_failed'),
        })
      },
      onError: () => trackErrorShown(ONBOARDING_QUESTION_SCREEN, 'onboarding_review_generate_failed'),
    })
  }

  // `runVerifyThenBuild` est recréée à chaque rendu (elle ferme sur les
  // mutations) : le tableau de dépendances la nomme honnêtement plutôt que de
  // désactiver la règle. Le garde-fou `started` (pas les dépendances) est ce
  // qui empêche le rejeu DANS cette visite — l'effet peut se ré-évaluer sans
  // effet de bord tant que la décision ci-dessous n'a pas encore été prise.
  useEffect(() => {
    if (started.current) return
    // #2012.13 — état serveur pas encore connu (requête en cours) : on ne
    // sait pas si un travail tourne déjà, existe déjà, ou a échoué. Rien ne
    // part tant qu'on ne sait pas.
    if (onboardingState.isPending || profileContext.isPending) return
    // Une erreur réseau ici est un `unknown`, jamais un échec qui autoriserait
    // une relance : elle ARRÊTE la reprise automatique au lieu de la déclencher.
    if (onboardingState.isError || profileContext.isError) return

    started.current = true

    // Un travail a déjà commencé côté serveur — vérification déjà posée,
    // génération déjà en cours, déjà terminée, ou déjà en échec — : la
    // génération ne repart JAMAIS toute seule à l'arrivée sur cet écran
    // (#2012.13). Le geste qui manque reste `retryVerify` / `retryBuild`,
    // jamais ce montage.
    //
    // Prod 19/10/2026 (eXteam) — un ANCIEN profil `succeeded`/`validated`/
    // `failed` ne prouve rien tant que le questionnaire n'est pas clos : c'est
    // le cas de « Mettre à jour mon audit », qui rouvre le questionnaire sans
    // toucher au profil précédent. Seule la vérification serveur (`completed`)
    // ou une génération EN COURS disent qu'un travail de CETTE visite existe.
    if (verifyAlreadyDone || profileStatus === 'generating') return

    runVerifyThenBuild()
  }, [
    onboardingState.isPending,
    onboardingState.isError,
    profileContext.isPending,
    profileContext.isError,
    verifyAlreadyDone,
    profileStatus,
    runVerifyThenBuild,
  ])

  const verifyState: StepState = complete.status !== 'idle' ? complete.status : verifyAlreadyDone ? 'success' : 'idle'
  const buildState: StepState =
    generateProfile.status !== 'idle' ? generateProfile.status : buildStepFromServer(profileStatus, verifyAlreadyDone)
  const phases = derivePhaseStatuses({ verify: verifyState, buildProfile: buildState })

  const failedPhase = GENERATION_PHASES.find(p => phases[p.code] === 'error')?.code ?? null
  const succeeded = GENERATION_PHASES.every(p => phases[p.code] === 'done')

  const retryVerify = (): void => runVerifyThenBuild()
  const retryBuild = (): void => {
    generateProfile.mutate(undefined, {
      onSuccess: () => trackOnboardingAuditGenerated(ONBOARDING_GENERATING_SCREEN),
      onError: () => trackErrorShown(ONBOARDING_QUESTION_SCREEN, 'onboarding_review_generate_failed'),
    })
  }

  return { phases, failedPhase, succeeded, retryVerify, retryBuild }
}
