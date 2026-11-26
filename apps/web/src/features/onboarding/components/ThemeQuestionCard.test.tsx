import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { TEMPS1_REQUIRED_KEYS } from '@bellum/contracts'
import { TEMPS1_CATALOGUE_SUBSTEPS } from '@/features/onboarding/lib/questions'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { ThemeQuestionCard } from './ThemeQuestionCard'

/**
 * #4818 — dans le cadrage, une réponse EXIGÉE par la porte de complétion ne se
 * lisait pas autrement qu'une facultative (« Pas encore répondu » partout).
 */

const allQuestions = TEMPS1_CATALOGUE_SUBSTEPS.flatMap(s => s.questions)
const requiredQuestion = allQuestions.find(q => q.key === TEMPS1_REQUIRED_KEYS[0])
const optionalQuestions = allQuestions
  .filter(q => !(TEMPS1_REQUIRED_KEYS as readonly string[]).includes(q.key))
  .slice(0, 3)

const renderCard = (question: Parameters<typeof ThemeQuestionCard>[0]['question'], index: number) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeQuestionCard question={question} index={index} />
    </QueryClientProvider>,
  )

beforeEach(() => {
  useOnboardingStore.setState({ answers: {}, statuses: {} })
})

describe('ThemeQuestionCard — exigée vs facultative (#4818)', () => {
  it('marque la question exigée sans réponse', () => {
    if (!requiredQuestion) throw new Error('clé exigée absente du catalogue')
    renderCard(requiredQuestion, 1)
    expect(screen.getByTestId('question-required')).toBeInTheDocument()
  })

  it('ne marque aucune des trois facultatives', () => {
    expect(optionalQuestions).toHaveLength(3)
    optionalQuestions.forEach((question, i) => {
      const { unmount } = renderCard(question, i + 1)
      expect(screen.queryByTestId('question-required')).not.toBeInTheDocument()
      unmount()
    })
  })
})
