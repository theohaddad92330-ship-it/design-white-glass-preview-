import type { Question } from '@/features/onboarding/lib/questions'

export type ChoiceQuestion = Extract<Question, { kind: 'single' | 'multi' | 'multi-grouped' }>

/** Les questions à choix passent par le sélecteur (`QuestionPicker`) ; texte, nombre et étiquettes restent en ligne. */
export function isChoiceQuestion(question: Question): question is ChoiceQuestion {
  return question.kind === 'single' || question.kind === 'multi' || question.kind === 'multi-grouped'
}
