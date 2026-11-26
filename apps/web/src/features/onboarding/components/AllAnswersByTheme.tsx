import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { onboardingQuestionRevealId } from '@/features/onboarding/components/SubStepQuestions'
import { buildFramingExport } from '@/features/onboarding/lib/framing-export'
import type { Question } from '@/features/onboarding/lib/questions'
import { THEMES } from '@/features/onboarding/lib/theme-catalog'
import { toDisplayValue } from '@/features/onboarding/lib/onboarding-review-blocks'
import { useOnboardingStore } from '@/stores/onboardingStore'

const QUESTION_BY_KEY = new Map<string, { question: Question }>(
  THEMES.flatMap(theme => theme.questions.map(q => [q.key, { question: q }] as const)),
)

/**
 * Théo O onboarding-relecture.R1 — « Relire toutes mes réponses renseignées ou
 * reportées », rangées par thème, chacune avec « Modifier » vers sa question.
 * Une question sans réponse ni statut ne fait aucune ligne.
 */
export function AllAnswersByTheme({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  const statuses = useOnboardingStore(s => s.statuses)
  const rows = buildFramingExport(answers, statuses)

  return (
    <details
      data-testid="review-all-answers"
      className="group rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-6 py-2"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
        {t('framingReview.allAnswers')}
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" />
      </summary>
      {rows.length === 0 ? (
        <Text element="p" size="sm" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('framingReview.allAnswersEmpty')}
        </Text>
      ) : (
        <div className="mt-3 space-y-4">
          {THEMES.map(theme => {
            const themeRows = rows.filter(r => r.themeLabelKey === theme.labelKey)
            if (themeRows.length === 0) return null
            return (
              <section key={theme.slug}>
                <Text element="h3" size="sm" weight="semibold">
                  {t(theme.labelKey)}
                </Text>
                <ul className="mt-1 divide-y divide-[var(--bellum-border)]">
                  {themeRows.map(row => {
                    const question = QUESTION_BY_KEY.get(row.key)?.question
                    const value =
                      row.value === null || !question
                        ? t(`answerStatus.${row.status}`)
                        : toDisplayValue(question, row.value, t)
                    return (
                      <li key={row.key} className="flex items-start justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
                            {t(row.questionLabelKey)}
                          </Text>
                          <Text element="span" size="sm" className="block">
                            {value}
                          </Text>
                        </span>
                        <Link
                          to="/onboarding/themes/$themeId"
                          params={{ themeId: theme.slug }}
                          hash={onboardingQuestionRevealId(row.key)}
                          aria-label={`${t('framingReview.edit')} : ${t(row.questionLabelKey)}`}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center"
                        >
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      {children && <div className="mt-6 space-y-4 pb-4">{children}</div>}
    </details>
  )
}
