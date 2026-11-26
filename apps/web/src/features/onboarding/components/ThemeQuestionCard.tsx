import { useRef } from 'react'
import { Clock, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { PrefillBadge } from '@/features/onboarding/components/PrefillBadge'
import { AnswerStatusSelect } from '@/features/onboarding/components/AnswerStatusSelect'
import { QuestionField } from '@/features/onboarding/components/QuestionField'
import { QuestionPicker } from '@/features/onboarding/components/QuestionPicker'
import { isRequiredAnswerKey } from '@/features/onboarding/lib/required-answers'
import { isChoiceQuestion } from '@/features/onboarding/lib/choice-question'
import { needsLocalStatus, statusOf, valueForStatus, type AnswerStatus } from '@/features/onboarding/lib/answer-status'
import { QUESTION_CONSEQUENCE_KEY } from '@/features/onboarding/lib/question-consequences'
import { QUESTION_HELP_KEY } from '@/features/onboarding/lib/question-help'
import { isQuestionVisible, type Question } from '@/features/onboarding/lib/questions'
import { emptyFor, presentedValue } from '@/features/onboarding/lib/validation'
import { onboardingQuestionRevealId } from '@/features/onboarding/components/SubStepQuestions'
import { trackPrefillReviewed } from '@/lib/product-tracker'
import { revealTargetProps } from '@/lib/reveal-target'
import { ONBOARDING_QUESTION_SCREEN } from '@/features/onboarding/lib/tracking'
import { useOnboardingStore } from '@/stores/onboardingStore'

/**
 * Théo O onboarding-theme.R1 — une question du catalogue (`.ob23-field`) : son numéro, son
 * libellé, son aide, le champ, puis le statut de la réponse. Quand le statut
 * est une incertitude, la saisie se range SOUS l'état et « Répondre » la
 * ramène (maquette V23). Une question que le branchement adaptatif ne
 * suggérerait pas n'est pas masquée (O5.R1) : elle se dit « pas suggérée dans
 * ton contexte » et reste répondable.
 */
export function ThemeQuestionCard({ question, index }: { question: Question; index: number }) {
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  const statuses = useOnboardingStore(s => s.statuses)
  const setAnswer = useOnboardingStore(s => s.setAnswer)
  const setStatus = useOnboardingStore(s => s.setStatus)
  const prefillMeta = useOnboardingStore(s => s.prefillMeta[question.key])
  const fieldRef = useRef<HTMLDivElement>(null)

  const value = presentedValue(question, answers[question.key])
  const status = statusOf(question, answers[question.key], statuses[question.key])
  const label = t(question.label, 'max' in question ? { max: question.max } : undefined)
  const consequenceKey = QUESTION_CONSEQUENCE_KEY[question.key]
  const helpKey = QUESTION_HELP_KEY[question.key]
  // #4818 — la MÊME source que la porte serveur (GA-26) : rien n'est recopié à la main.
  const requiredMissing = status === 'empty' && isRequiredAnswerKey(question.key)
  const uncertain = status !== 'answered' && status !== 'empty'

  const change = (next: string | string[]): void => {
    setAnswer(question.key, next)
    if (statuses[question.key]) setStatus(question.key, null)
  }
  const select = (next: AnswerStatus): void => {
    if (next === 'answered') {
      // « Répondre » : l'incertitude se retire, la saisie revient — jamais une valeur fabriquée.
      setAnswer(question.key, emptyFor(question))
      setStatus(question.key, null)
      return
    }
    setAnswer(question.key, valueForStatus(question, next))
    setStatus(question.key, needsLocalStatus(question) ? next : null)
  }
  const clear = (): void => {
    setAnswer(question.key, emptyFor(question))
    setStatus(question.key, null)
  }

  return (
    <section
      className="flex flex-col gap-3 border-b border-[var(--bellum-border)] pb-6"
      data-question={question.key}
      data-testid="framing-field"
      {...revealTargetProps(onboardingQuestionRevealId(question.key))}
    >
      <div className="space-y-2">
        <div className="flex items-baseline gap-3">
          <Text element="span" size="xs" className="shrink-0 font-mono text-[var(--bellum-text-muted)]">
            {String(index).padStart(2, '0')}
          </Text>
          <Text element="h3" size="base" weight="semibold" className="leading-snug">
            {label}
          </Text>
        </div>
        {question.subtitle && (
          <Text element="p" size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
            {t(question.subtitle, 'max' in question ? { max: question.max } : undefined)}
          </Text>
        )}
        {requiredMissing && (
          <Text
            element="p"
            size="xs"
            weight="medium"
            data-testid="question-required"
            className="text-[var(--warning-soft-text)]"
          >
            {t('answerStatus.emptyRequired')}
          </Text>
        )}
        {helpKey && (
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t(helpKey)}
          </Text>
        )}
        {!isQuestionVisible(question, answers) && (
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('themePage.notSuggested')}
          </Text>
        )}
      </div>

      {uncertain ? (
        // Théo O onboarding-theme — l'incertitude se range dans un cadre pointillé ; « Répondre » ramène la saisie.
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-dashed border-[var(--bellum-border-strong)] px-4 py-3">
          <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" />
          <span className="min-w-0 flex-1">
            <Text element="span" size="sm" className="block text-[var(--bellum-text-secondary)]">
              {t(`answerStatus.${status}`)}
            </Text>
          </span>
          <Button type="button" variant="soft" onClick={() => select('answered')}>
            {t('answerStatus.answerNow')}
          </Button>
        </div>
      ) : (
        <div ref={fieldRef}>
          {isChoiceQuestion(question) ? (
            <QuestionPicker question={question} label={label} value={value} onChange={change} answers={answers} />
          ) : (
            <QuestionField question={question} value={value} onChange={change} answers={answers} autoFocus={false} />
          )}
        </div>
      )}

      {/* Théo O onboarding-essentiel.A1 — une réponse PROPOSÉE (depuis le site) se dit « à confirmer » : jamais une réponse validée. */}
      {prefillMeta && !uncertain && (
        <PrefillBadge
          meta={prefillMeta}
          onConfirm={() => {
            trackPrefillReviewed(ONBOARDING_QUESTION_SCREEN, 'confirmed')
            change(value)
          }}
          onCorrect={() => {
            trackPrefillReviewed(ONBOARDING_QUESTION_SCREEN, 'corrected')
            fieldRef.current?.querySelector<HTMLElement>('input, textarea, button, [role="combobox"]')?.focus()
          }}
          onIgnore={() => {
            trackPrefillReviewed(ONBOARDING_QUESTION_SCREEN, 'ignored')
            clear()
          }}
        />
      )}

      <AnswerStatusSelect questionLabel={label} status={status} onSelect={select} onClear={clear} />

      {consequenceKey && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs text-[var(--bellum-text-accent)]">
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
            {t('themePage.consequence')}
          </summary>
          <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t(consequenceKey)}
          </Text>
        </details>
      )}
    </section>
  )
}
