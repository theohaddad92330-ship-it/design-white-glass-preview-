import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisEntityQuestion } from '@bellum/contracts'

/**
 * #2164.17 — corriger une ambiguïté PENDANT le job : la carte nomme les
 * sociétés homonymes et laisse en choisir une ; le run reprend aussitôt. Sans
 * question en attente, rien ne s'affiche.
 */
const answer = vi.fn()
const state: { question: AnalysisEntityQuestion | null; pending: boolean } = { question: null, pending: false }
vi.mock('@/features/accounts/hooks/useAnalysisEntityQuestion', () => ({
  useAnalysisEntityQuestion: () => ({
    data: state.question === null ? { question: null } : { question: state.question },
  }),
  useAnswerEntityQuestion: () => ({ mutate: answer, isPending: state.pending }),
}))

const { AnalysisEntityQuestionCard } = await import('./AnalysisEntityQuestionCard')

const QUESTION: AnalysisEntityQuestion = {
  candidates: [
    { name: 'BPCE', siren: '493455042', city: 'Paris' },
    { name: 'BPCE Lease', siren: '332357286', city: null },
  ],
  hypothesisSiren: '493455042',
  askedAt: '2026-11-01T10:00:00.000Z',
  expiresAt: '2026-11-01T10:05:00.000Z',
}

beforeEach(() => {
  state.question = null
  state.pending = false
  answer.mockReset()
})
afterEach(cleanup)

describe('AnalysisEntityQuestionCard — #2164.17', () => {
  it('nomme chaque société homonyme et envoie le SIREN choisi', () => {
    state.question = QUESTION
    render(<AnalysisEntityQuestionCard accountId="acc-1" />)
    expect(screen.getByText(/Plusieurs sociétés portent ce nom/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /BPCE Lease/ }))
    expect(answer).toHaveBeenCalledWith('332357286')
  })

  it('dit sur quelle société l’analyse continuera sans réponse', () => {
    state.question = QUESTION
    render(<AnalysisEntityQuestionCard accountId="acc-1" />)
    expect(screen.getByTestId('entity-question-fallback')).toHaveTextContent('BPCE')
    expect(screen.getByRole('button', { name: /BPCE · SIREN 493455042 · Paris/ })).toBeInTheDocument()
  })

  it('NON — sans question en attente, la carte ne rend rien', () => {
    const { container } = render(<AnalysisEntityQuestionCard accountId="acc-1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
