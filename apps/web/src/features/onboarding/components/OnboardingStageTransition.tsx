import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { TEMPS1_STAGES, TEMPS1_SUBSTEPS, type FlatSubStep } from '@/features/onboarding/lib/questions'

/**
 * #2087.19 — une sous-étape est l'ENTRÉE de son étape quand elle en est la
 * première POSÉE au Temps 1 (les sous-étapes entièrement reportées au Temps 2
 * sont déjà sorties de `TEMPS1_SUBSTEPS`). Lu sur la séquence réelle, jamais
 * sur une liste de slugs recopiée.
 */
export function isStageEntry(sub: FlatSubStep): boolean {
  const previous = TEMPS1_SUBSTEPS[sub.index - 1]
  return !previous || previous.stageIndex !== sub.stageIndex
}

/**
 * #2087.19 / #2087.20 — l'écran de transition très court à l'entrée de chaque
 * étape : le titre de l'étape, une phrase qui dit à quoi elle sert, et UN seul
 * geste, « Continuer ». Il dure un clic ; il ne pose aucune question et n'écrit
 * rien (les réponses restent l'affaire de la sous-étape qui suit).
 */
export function OnboardingStageTransition({ stageIndex, onContinue }: { stageIndex: number; onContinue: () => void }) {
  const { t } = useTranslation('onboarding')
  const stage = TEMPS1_STAGES[stageIndex]
  if (!stage) return null

  return (
    <section
      data-testid="onboarding-stage-transition"
      className="mx-auto flex min-h-[60dvh] w-full max-w-xl flex-col justify-center gap-4 px-4 md:px-6"
    >
      <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
        {t('stageTransition.position', { current: stageIndex + 1, total: TEMPS1_STAGES.length })}
      </Text>
      <Text element="h1" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t(stage.title)}
      </Text>
      <Text
        element="p"
        size="base"
        className="text-[var(--bellum-text-secondary)]"
        data-testid="onboarding-stage-transition-meaning"
      >
        {t(`stageTransition.meaning.${stage.code}`)}
      </Text>
      <div>
        <Button type="button" variant="default" icon={ArrowRight} iconPosition="right" onClick={onContinue}>
          {t('stageTransition.continue')}
        </Button>
      </div>
    </section>
  )
}
