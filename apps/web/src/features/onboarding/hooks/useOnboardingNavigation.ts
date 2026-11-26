import type { RefObject } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { EsnAnswers, OnboardingStateResponse } from '@bellum/contracts'
import { useAdvanceStage, useCompleteOnboarding, useSaveAnswers } from '@/features/onboarding/hooks/useOnboarding'
import { awaitingNeighbour, isAwaitingAdmin } from '@/features/onboarding/lib/awaiting-admin'
import { landingRouteNow } from '@/features/preferences/preferences-provider'
import { TEMPS1_SUBSTEPS, type FlatSubStep } from '@/features/onboarding/lib/questions'
import {
  ONBOARDING_BACK_ERROR_CODE,
  ONBOARDING_CONTINUE_ERROR_CODE,
  ONBOARDING_QUESTION_SCREEN,
} from '@/features/onboarding/lib/tracking'
import { presentedValue } from '@/features/onboarding/lib/validation'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { trackErrorShown, trackOnboardingStepBack } from '@/lib/product-tracker'
import { ApiError } from '@/lib/api-error'

/**
 * #2537.4 — Ludovic (call bêta 17/09) : le message affiché doit dire CE QUI a
 * échoué (réseau, enregistrement, session, espace), jamais un texte unique et
 * flou. Un CODE fermé (le TYPE d'erreur, `ApiError.status`), jamais
 * `err.message` (#2085.18 — un message serveur peut porter un fragment de
 * réponse).
 *  - réseau : `fetch` lève un `TypeError` quand la connexion est coupée avant
 *    même d'atteindre le serveur (« Failed to fetch »).
 *  - session : un 401 — le jeton ne vaut plus rien même après le
 *    rafraîchissement silencieux (`apiFetch`, `@/lib/api.ts`), ou un appareil
 *    révoqué (R15-7, `jwt.strategy.ts:159`) — toujours une `UnauthorizedException`,
 *    jamais un 403.
 *  - espace (#2084.13) : un 403 — `WorkspaceContextService`
 *    (`resolveActiveWorkspace`/`assertMember`, `apps/api/.../workspace-context.
 *    service.ts`) rend un 403 NU (aucun `code`) quand l'utilisateur n'appartient
 *    plus à l'espace actif ou n'en a aucun. Ce n'est PAS une session morte : le
 *    jeton reste valide, c'est l'ESPACE qui est fermé. `sessionIsDead` (qui
 *    couvre 401 ET 403, à raison pour `/auth/refresh`) ne doit donc PAS servir
 *    ici — seul le statut brut tranche.
 *  - enregistrement : tout le reste (5xx, timeout serveur, etc.) — le message
 *    par défaut, inchangé depuis #2026.7.
 */
function onboardingSaveErrorKey(err: unknown): string {
  if (err instanceof TypeError) return 'toast.saveErrorNetwork'
  if (err instanceof ApiError && err.status === 401) return 'toast.saveErrorSession'
  if (err instanceof ApiError && err.status === 403) return 'toast.saveErrorWorkspace'
  return 'toast.saveError'
}

type Navigation = {
  pending: boolean
  onContinue: () => Promise<void>
  onBack: () => Promise<void>
  /** #3553 — saute à une sous-étape quelconque (rail cliquable). */
  onJump: (target: FlatSubStep) => Promise<void>
}

/**
 * Drives forward/back movement through the global sub-step sequence: persists
 * the current sub-step's answers, advances the server stage when crossing a
 * stage boundary, then routes to the neighbouring sub-step — or, once the last
 * sub-step's answers are saved, to the REVIEW screen (`/onboarding/$id/review`,
 * #2030), from which the audit generation actually starts.
 */
export function useOnboardingNavigation(
  state: OnboardingStateResponse,
  sub: FlatSubStep,
  // #2541 — le conteneur qui défile RÉELLEMENT, injecté par référence : voir
  // `goTo` ci-dessous pour la raison. Optionnel pour ne pas forcer chaque
  // test existant (erreurs réseau, session, etc.) à en fournir un factice —
  // le seul appelant réel (`OnboardingWizard.tsx`) le passe toujours.
  scrollContainerRef?: RefObject<HTMLDivElement | null>,
): Navigation {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()
  const save = useSaveAnswers()
  const advance = useAdvanceStage()
  const complete = useCompleteOnboarding()
  // #4158.12 — un membre qui attend l'administrateur suit la séquence des
  // seules questions PERSONNELLES (voisins, fin) ; l'index global de la
  // sous-étape reste celui du parcours entier.
  const awaiting = isAwaitingAdmin(state)
  const answers = useOnboardingStore(s => s.answers)

  // #2030 — ni `complete` ni `generateProfile` ne sont plus déclenchés d'ici :
  // les garder dans `pending` immobiliserait le bouton sur une mutation que ce
  // hook ne lance pas. C'est le CTA de la relecture qui porte leur attente.
  const pending = save.isPending || advance.isPending || complete.isPending

  const stagePayload = (): Partial<EsnAnswers> =>
    Object.fromEntries(sub.questions.map(q => [q.key, presentedValue(q, answers[q.key])])) as Partial<EsnAnswers>

  const goTo = (target: FlatSubStep): void => {
    navigate({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: state.id, stage: target.stageCode, slug: target.slug },
    })
    // #2541 — Ludovic (call bêta 17/09) : la position de défilement était
    // conservée d'une salve à l'autre, le nouveau formulaire s'ouvrait au
    // milieu. La navigation change de sous-étape mais pas de page DOM (même
    // route paramétrée) : le scroll ne se remet jamais seul.
    //
    // ⚠️ Mesuré en production le 18/09 : ce n'est PAS `window` qui défile.
    // C'est un conteneur interne (`div.flex-1.overflow-y-auto` dans
    // `OnboardingWizard.tsx`) — `window.scrollY` y vaut toujours 0, quel que
    // soit l'endroit où l'utilisateur se trouve. Un premier correctif
    // appelait `window.scrollTo` : il remontait fidèlement un élément qui
    // n'avait jamais bougé. On remonte donc la RÉFÉRENCE reçue, jamais
    // `window` — comportement instantané, sans rebond ni glissement de plan
    // d'arrière-plan (aucun `behavior: 'smooth'` : la grammaire de mouvement,
    // `packages/ui/src/motion.ts`, n'a rien à réduire ici pour
    // `prefers-reduced-motion`).
    scrollContainerRef?.current?.scrollTo({ top: 0, left: 0 })
  }

  const onContinue = async (): Promise<void> => {
    try {
      await save.mutateAsync(stagePayload())
      if (awaiting && awaitingNeighbour(sub, 1) === null) {
        // #4158.12 — « son onboarding se termine quand ses questions perso sont
        // faites » : pas de relecture ni de génération d'audit (elles portent
        // sur la fiche ENTREPRISE, qui n'existe pas encore) — la complétion
        // part ici, puis le membre entre dans le produit.
        await complete.mutateAsync()
        navigate({ to: landingRouteNow() })
        return
      }
      if (!awaiting && sub.index === TEMPS1_SUBSTEPS.length - 1) {
        // #2030 — la dernière sous-étape mène à l'écran de RELECTURE, qui est
        // le point d'arrivée du questionnaire. Il était livré, fonctionnel et
        // atteignable par son URL, mais rien n'y menait : c'est cette ligne
        // qui en fait un point d'arrivée plutôt qu'une page orpheline.
        //
        // La complétion (`complete` + `trackActionCompleted` + génération du
        // profil) appartient désormais au CTA « Générer mon audit » de cet
        // écran : la jouer ICI aussi la ferait jouer deux fois et rendrait la
        // relecture cosmétique — le questionnaire serait déjà clos en
        // l'atteignant.
        //
        // #2089.28 — ce CTA n'appelle plus la génération directement : il
        // ouvre l'écran de génération dédié (`/onboarding/$id/generating`,
        // `useGenerateAuditPhases`), qui la déclenche VRAIMENT et n'atterrit
        // sur `/welcome` qu'au clic MANUEL sur « Découvrir mon audit »
        // (#2089.36) — jamais une redirection automatique après un job de
        // 3 à 6 minutes.
        //
        // Théo restitution P0-01 (p.6/8) : l'écran de bienvenue validé DOIT
        // rester le point d'arrivée du PARCOURS — il rejoue le prénom, le
        // profil réellement sauvegardé, les 4 promesses, les premières
        // suggestions et le double CTA. La garantie est inchangée, seul
        // change QUI fait le dernier saut ; les TROIS maillons sont pinnés
        // séparément : `useOnboardingNavigation.test.tsx` (ici →
        // `/review`), `OnboardingReviewPage.test.tsx` (`/review` →
        // `/generating`), `OnboardingGeneratingPage.test.tsx`
        // (`/generating` → `/welcome`).
        navigate({ to: '/onboarding/$id/review', params: { id: state.id } })
        return
      }
      const next = awaiting ? awaitingNeighbour(sub, 1) : TEMPS1_SUBSTEPS[sub.index + 1]
      if (!next) return
      if (next.stageCode !== sub.stageCode) await advance.mutateAsync(next.stageCode)
      goTo(next)
    } catch (err) {
      // #2085.18 — un CODE fermé, jamais `err.message` : un message d'erreur
      // serveur peut porter un fragment de la réponse, donc potentiellement du
      // contenu.
      // #2026.7 — et jamais un texte TECHNIQUE brut non plus (« Failed to
      // fetch ») : le brouillon local (#2026.1) a déjà gardé la réponse, donc
      // le message dit où elle est plutôt que d'alarmer sans le dire. Pas de
      // promesse de réessai AUTOMATIQUE : `useSaveAnswers` n'en fait pas, une
      // synchronisation inventée serait une donnée fictive.
      // #2537.4 — trois messages distincts (réseau / session / enregistrement),
      // voir `onboardingSaveErrorKey` ci-dessus.
      trackErrorShown(ONBOARDING_QUESTION_SCREEN, ONBOARDING_CONTINUE_ERROR_CODE)
      toast.error(t(onboardingSaveErrorKey(err)))
    }
  }

  const onBack = async (): Promise<void> => {
    const prev = awaiting ? awaitingNeighbour(sub, -1) : (TEMPS1_SUBSTEPS[sub.index - 1] ?? null)
    if (!prev) return
    // #2085.17 — le geste EST la décision (un clic « Retour ») : posé avant
    // l'enregistrement asynchrone, pas seulement en cas de succès.
    trackOnboardingStepBack(ONBOARDING_QUESTION_SCREEN)
    try {
      await save.mutateAsync(stagePayload())
      if (prev.stageCode !== sub.stageCode) await advance.mutateAsync(prev.stageCode)
      goTo(prev)
    } catch (err) {
      trackErrorShown(ONBOARDING_QUESTION_SCREEN, ONBOARDING_BACK_ERROR_CODE)
      // #2026.7 / #2537.4 — même classification que `onContinue` au-dessus.
      toast.error(t(onboardingSaveErrorKey(err)))
    }
  }

  /**
   * #3553 — le rail de gauche est cliquable : même contrat que `onBack` —
   * ENREGISTRER d'abord la page quittée (aucune saisie perdue), déplacer le
   * pointeur d'étape du serveur quand le stage change, puis router. Un
   * enregistrement qui échoue ne navigue pas : la saisie reste à l'écran.
   */
  const onJump = async (target: FlatSubStep): Promise<void> => {
    if (target.index === sub.index) return
    try {
      await save.mutateAsync(stagePayload())
      if (target.stageCode !== sub.stageCode) await advance.mutateAsync(target.stageCode)
      goTo(target)
    } catch (err) {
      trackErrorShown(ONBOARDING_QUESTION_SCREEN, ONBOARDING_CONTINUE_ERROR_CODE)
      toast.error(t(onboardingSaveErrorKey(err)))
    }
  }

  return { pending, onContinue, onBack, onJump }
}
