import { useParams } from '@tanstack/react-router'
import { BrailleLoader } from '@bellum/ui'
import { GuidedFramingShell } from '@/features/onboarding/components/GuidedFramingShell'
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { isAwaitingAdmin } from '@/features/onboarding/lib/awaiting-admin'
import { findSubStep, firstSlugOfStage, TEMPS1_STAGE_CODES } from '@/features/onboarding/lib/questions'
import { OnboardingWizard } from '@/features/onboarding/view/OnboardingWizard'

/**
 * Théo O onboarding-essentiel / onboarding-guide — le cadrage en deux marches
 * (cinq blocs, puis huit étapes) vit sur l'adresse du parcours existant.
 *
 * Deux espaces gardent le parcours question par question, qui porte leurs
 * gestes propres : le membre qui attend l'administrateur (questions
 * personnelles seulement, #4158.12) et celui dont l'entreprise a déjà répondu
 * (réponses héritées, bandeau de l'espace). Ils ne perdent rien.
 */
export function OnboardingStagePage() {
  const { stage, slug } = useParams({ from: '/onboarding/$id/$stage/$slug' })
  const { data: state } = useOnboardingState()

  if (!state) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <BrailleLoader variant="grid-searching" />
      </div>
    )
  }
  if (isAwaitingAdmin(state) || state.inherited_answer_keys.length > 0) {
    return <OnboardingWizard stageCode={stage} slug={slug} />
  }
  // L'adresse d'ENTRÉE du parcours (première sous-étape, où mènent la fiche entreprise et l'accueil) ne
  // cible aucune question : c'est elle qui ouvre l'essentiel tant qu'il n'est pas traité (Théo O
  // onboarding-essentiel). Toute autre adresse — un « Modifier » de la relecture — cible sa question.
  const entry = stage === TEMPS1_STAGE_CODES[0] && slug === firstSlugOfStage(stage)
  return <GuidedFramingShell targetKey={entry ? null : (findSubStep(stage, slug)?.questions[0]?.key ?? null)} />
}
