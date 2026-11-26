import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isAnswerFilled } from '@bellum/contracts'
import { Button, Card, CardContent, Text } from '@bellum/ui'
import { findSubStep, TEMPS1_SUBSTEPS, type FlatSubStep, type Question } from '@/features/onboarding/lib/questions'
import { useOnboardingStore } from '@/stores/onboardingStore'

/** Exportée pour les tests (#2020.6) : ils doivent pouvoir simuler « le message
 *  de reprise a déjà été consommé cet onglet » sans dupliquer la chaîne. */
export const RESUME_FLAG_KEY = 'bellum:onboarding-guide-resumed'

/**
 * #2020 — le guide de Laura pendant le questionnaire d'onboarding.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE N'ATTEND PAS DE PROPS
 * ─────────────────────────────────────────────────────────────────────────
 * `OnboardingWizard.tsx` (un autre lot le tient) rend `<OnboardingHelpCard />`
 * sans le moindre prop — impossible d'y faire passer la sous-étape courante.
 * Ce composant relit donc l'URL directement (`window.location.pathname`),
 * exactement le même contrat que la route `/onboarding/$id/$stage/$slug`
 * (`routes/onboarding/$id/$stage/$slug.tsx`), puis retrouve la sous-étape avec
 * `findSubStep` — la MÊME fonction pure que `OnboardingStagePage`/`OnboardingWizard`
 * utilisent, donc aucune resynchronisation possible entre deux lectures de la
 * même vérité. Zéro dépendance au routeur : ni `useParams`, ni `RouterProvider`
 * dans les tests.
 */
export function parseOnboardingSubStep(pathname: string): FlatSubStep | undefined {
  const match = /^\/onboarding\/[^/]+\/([^/]+)\/([^/]+)\/?$/.exec(pathname)
  if (!match) return undefined
  const [, stage, slug] = match
  return findSubStep(stage, slug)
}

/** La sous-étape courante est-elle la DERNIÈRE de son étape ? */
function isLastSubStepOfStage(sub: FlatSubStep): boolean {
  return !TEMPS1_SUBSTEPS.some(s => s.stageCode === sub.stageCode && s.index > sub.index)
}

/**
 * #2020.6 — les questions des sous-étapes déjà PASSÉES de la même étape.
 *
 * Filtrées sur `isAnswerFilled` plutôt que sur la seule position : le bouton
 * « Continuer » (`OnboardingWizard.tsx`) bloque déjà tant que la sous-étape
 * quittée n'est pas valide, donc une question antérieure est normalement
 * toujours répondue — mais ce composant ne DÉPEND pas de ce garde pour rester
 * honnête (craft rule « jamais de donnée fictive ») : il relit la vraie
 * réponse plutôt que de supposer qu'elle existe.
 */
function answeredPriorStageQuestions(sub: FlatSubStep, answers: Record<string, string | string[]>): Question[] {
  return TEMPS1_SUBSTEPS.filter(s => s.stageCode === sub.stageCode && s.index < sub.index)
    .flatMap(s => s.questions)
    .filter(q => isAnswerFilled(answers[q.key]))
}

export function OnboardingLauraGuide() {
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  const [dismissed, setDismissed] = useState(false)

  const sub = typeof window === 'undefined' ? undefined : parseOnboardingSubStep(window.location.pathname)

  // #2020.7 — atterrir directement sur une sous-étape qui N'EST PAS la
  // première du parcours ne peut venir, dans ce produit, que d'une reprise
  // (`onboarding-gate.ts` renvoie « continue » vers la sous-étape en cours) ou
  // d'un rafraîchissement en cours de route — les deux méritent la même
  // phrase honnête : rien n'a été perdu. Une seule fois par onglet
  // (`sessionStorage`), calculé une seule fois au premier rendu.
  const [resumeEligible] = useState<boolean>(() => {
    if (!sub || sub.index === 0) return false
    try {
      if (sessionStorage.getItem(RESUME_FLAG_KEY) === '1') return false
      sessionStorage.setItem(RESUME_FLAG_KEY, '1')
      return true
    } catch {
      // Stockage indisponible (navigation privée…) : on ne bloque rien, on se
      // tait simplement plutôt que de risquer une boucle de message.
      return false
    }
  })

  if (!sub) return null

  const priorQuestions = isLastSubStepOfStage(sub) ? answeredPriorStageQuestions(sub, answers) : []

  // #2020.13 — une seule intervention contextuelle par écran : si la reprise
  // s'applique, elle est SEULE affichée ; le résumé d'étape ne prend jamais sa
  // place après un « Compris », pour ne jamais empiler deux interventions sur
  // le même écran.
  const showResume = resumeEligible && !dismissed
  const showSummary = !resumeEligible && priorQuestions.length > 0

  // #2020.12 — rien ici ne réagit à la frappe : ce composant se recalcule au
  // montage (une sous-étape = un montage, `WizardContent` porte `key={sub.index}`)
  // et ne s'abonne à aucun événement de saisie.
  if (!showResume && !showSummary) return null

  return (
    <Card className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
      <CardContent className="space-y-3 p-5">
        <div className="inline-flex items-center gap-2 text-[var(--bellum-text-accent)]">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <Text element="span" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('guide.title')}
          </Text>
        </div>

        {showResume && (
          <div className="space-y-2">
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('guide.resume.message')}
            </Text>
            {/* #2020.11 — un bouton qui referme le message EN PLACE, jamais un
                dialogue : la page reste ouverte et saisissable pendant l'aide. */}
            <Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)}>
              {t('guide.resume.dismiss')}
            </Button>
          </div>
        )}

        {showSummary && (
          <div className="space-y-2">
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('guide.stageSummary.title')}
            </Text>
            <ul className="space-y-1">
              {priorQuestions.map(question => (
                <li key={question.key} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
                  <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t(question.label)}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
