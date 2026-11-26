import type { TFunction } from 'i18next'
import { statusOf, type AnswerStatus, type DeclaredStatus } from '@/features/onboarding/lib/answer-status'
import { THEMES } from '@/features/onboarding/lib/theme-catalog'
import { presentedValue } from '@/features/onboarding/lib/validation'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

type Translate = TFunction<'onboarding'> | ((key: string) => string)

type FramingRow = {
  key: string
  themeLabelKey: string
  questionLabelKey: string
  status: AnswerStatus
  /** `null` quand le statut est une incertitude : la valeur n'est jamais fabriquée. */
  value: string | string[] | null
}

/**
 * Théo O onboarding-relecture.N4 — « Emporter ton cadrage » : les réponses ET
 * leurs statuts, rien d'autre de l'espace. Une question sans réponse ni statut
 * ne fait AUCUNE ligne (on n'affiche pas ce qu'on n'a pas).
 */
export function buildFramingExport(
  answers: OnboardingAnswers,
  statuses: Readonly<Record<string, DeclaredStatus | undefined>>,
): FramingRow[] {
  return THEMES.flatMap(theme =>
    theme.questions.flatMap(question => {
      const status = statusOf(question, answers[question.key], statuses[question.key])
      if (status === 'empty') return []
      const value = status === 'answered' ? presentedValue(question, answers[question.key]) : null
      return [{ key: question.key, themeLabelKey: theme.labelKey, questionLabelKey: question.label, status, value }]
    }),
  )
}

export function framingToJson(rows: readonly FramingRow[]): string {
  return JSON.stringify(
    { version: 'onboarding-v23', answers: rows.map(r => ({ key: r.key, status: r.status, value: r.value })) },
    null,
    2,
  )
}

export function framingToText(rows: readonly FramingRow[], t: Translate): string {
  const translate = (key: string): string => String((t as (k: string) => string)(key))
  const lines: string[] = []
  let current = ''
  for (const row of rows) {
    if (row.themeLabelKey !== current) {
      current = row.themeLabelKey
      if (lines.length > 0) lines.push('')
      lines.push(translate(current))
    }
    const shown = row.value === null ? translate(`answerStatus.${row.status}`) : [row.value].flat().join(', ')
    lines.push(`- ${translate(row.questionLabelKey)} : ${shown}`)
  }
  return lines.join('\n')
}
