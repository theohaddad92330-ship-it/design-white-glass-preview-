import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageLearningSummary } from './MessageLearningSummary'

/**
 * #2877 (recette prod 02/10) — l'écran agrégat d'apprentissage des messages.
 * Doctrine défendue : des comptes (jamais un taux), un bloc sans échantillon
 * ne fait aucune ligne, le délai médian absent se dit « non mesuré » (jamais
 * « 0 h »), la règle n'est que PROPOSÉE.
 */
const { useSummaryMock } = vi.hoisted(() => ({ useSummaryMock: vi.fn() }))
vi.mock('@/features/message-style/hooks/useMessageStyle', () => ({ useMessageLearningSummary: useSummaryMock }))

afterEach(cleanup)

const EMPTY = { express: null, behavioral: null, quality: null, proposedRule: null, globalRule: null, history: [] }

describe('MessageLearningSummary', () => {
  it("dit « aucun signal » quand rien n'est mesuré, sans rangée de zéros", () => {
    useSummaryMock.mockReturnValue({ data: EMPTY, isLoading: false, isError: false })
    render(<MessageLearningSummary />)
    expect(screen.getByText(/Aucun signal pour l'instant/)).toBeInTheDocument()
    expect(screen.queryByText(/validés tels quels/)).not.toBeInTheDocument()
  })

  it('montre les comptes mesurés, le délai non mesuré et ne nomme que les problèmes déclarés', () => {
    useSummaryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        express: { approvedWithoutEdit: 5, approvedAfterEdit: 2, rejected: 3, sample: 10 },
        behavioral: {
          sent: 6,
          replied: 2,
          meetingBooked: 1,
          optOut: 1,
          bounced: 0,
          medianReplyDelayHours: null,
          sample: 9,
        },
        quality: { wrongFact: 2, wrongCta: 0, wrongPersona: 1, flaggedMessages: 3 },
        proposedRule: { summary: 'Garde les messages courts', basedOnSample: 12 },
        globalRule: null,
        history: [
          {
            version: 1,
            status: 'rejected',
            summary: 'Ancienne règle',
            basedOnSample: 8,
            createdAt: '',
            decidedAt: '',
          },
        ],
      },
    })
    render(<MessageLearningSummary />)
    expect(screen.getByText('5 validés tels quels')).toBeInTheDocument()
    expect(screen.getByText(/Délai médian de réponse : non mesuré/)).toBeInTheDocument()
    expect(screen.queryByText(/0 h/)).not.toBeInTheDocument()
    expect(screen.getByText('2 faux faits')).toBeInTheDocument()
    expect(screen.queryByText(/appels à l'action incorrects/)).not.toBeInTheDocument()
    expect(screen.getByText('Garde les messages courts')).toBeInTheDocument()
    expect(screen.getByText(/jamais appliquée sans accord/)).toBeInTheDocument()
    expect(screen.getByText(/Refusée · Ancienne règle/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it("dit l'erreur plutôt que de rendre des zéros", () => {
    useSummaryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<MessageLearningSummary />)
    expect(screen.getByText(/n'a pas pu être lu/)).toBeInTheDocument()
  })

  // #2877.1 — le niveau GLOBAL : une règle commune se montre ; son absence ne fait aucune ligne.
  it('montre la règle commune anonymisée quand elle existe, rien quand elle manque', () => {
    useSummaryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...EMPTY, globalRule: { summary: 'Ouvre par un fait du compte', basedOnSample: 40 } },
    })
    const { unmount } = render(<MessageLearningSummary />)
    expect(screen.getByTestId('message-learning-global-rule')).toHaveTextContent('Ouvre par un fait du compte')
    expect(screen.getByText(/anonymisés/)).toBeInTheDocument()
    unmount()
    useSummaryMock.mockReturnValue({ data: EMPTY, isLoading: false, isError: false })
    render(<MessageLearningSummary />)
    expect(screen.queryByTestId('message-learning-global-rule')).not.toBeInTheDocument()
  })
})
