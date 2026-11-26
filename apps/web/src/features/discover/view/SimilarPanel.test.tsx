import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SimilarPanel } from './SimilarPanel'

let suggestions: SimilarAccountSuggestion[] = []

vi.mock('@/features/accounts/hooks/useSimilarAccountsToExplore', () => ({
  useSimilarAccountsToExplore: () => ({ data: suggestions, isLoading: false, isError: false, refetch: vi.fn() }),
}))

function suggestion(n: number, over: Partial<SimilarAccountSuggestion> = {}): SimilarAccountSuggestion {
  return {
    id: `s-${n}`,
    company_name: `Société ${n}`,
    sector: 'Banque',
    description: `Description ${n}`,
    ...over,
  } as SimilarAccountSuggestion
}

/** La carte d'une suggestion, retrouvée depuis son nom. */
function cardOf(name: string): HTMLElement {
  const card = screen.getByText(name).closest('div.rounded-xl')
  if (!(card instanceof HTMLElement)) throw new Error(`carte introuvable : ${name}`)
  return card
}

beforeEach(() => {
  suggestions = []
})

/**
 * #2040.18 — LE PANNEAU « SIMILAIRES » DE DÉCOUVRIR NOMME SES AXES.
 *
 * La carte de compte nommait déjà ce qui rapproche une suggestion et ce que le
 * questionnaire ne permet pas de juger ; le panneau de Découvrir montrait le
 * MÊME objet avec un niveau (« Recoupe ton profil ») et rien d'autre. Un score
 * n'est jamais nu : ses axes sont nommés, et ce qui n'a pas pu être évalué
 * l'est aussi.
 */
describe('SimilarPanel — un niveau ne voyage jamais sans ses axes (#2040.18)', () => {
  it('sait dire NON — chaque niveau affiché a, dans SA carte, la ligne de ses axes', async () => {
    suggestions = [
      suggestion(1, {
        score_similarity: 1,
        similarity_reasons: ['sector', 'geo', 'size'],
        similarity_confidence: 'etayee',
      }),
      suggestion(2, {
        score_similarity: 3 / 7,
        similarity_reasons: ['sector'],
        similarity_confidence: 'etayee',
      }),
    ]
    renderWithRouter(<SimilarPanel />)
    await screen.findByText('Société 1')

    const levels = [...screen.getAllByText('Recoupe ton profil'), ...screen.getAllByText('Recoupe en partie')]
    // Le corpus est LU : deux niveaux rendus, pas zéro.
    expect(levels).toHaveLength(2)
    for (const level of levels) {
      const card = level.closest('div.rounded-xl')
      expect(card).toBeInstanceOf(HTMLElement)
      expect(within(card as HTMLElement).getByTestId('similar-axes')).toBeInTheDocument()
    }
  })

  it('témoin — un profil complet affiche le niveau ET ses trois axes', async () => {
    suggestions = [
      suggestion(1, {
        score_similarity: 1,
        similarity_reasons: ['sector', 'geo', 'size'],
        similarity_confidence: 'etayee',
      }),
    ]
    renderWithRouter(<SimilarPanel />)
    await screen.findByText('Société 1')

    const card = cardOf('Société 1')
    expect(within(card).getByText('Recoupe ton profil')).toBeInTheDocument()
    expect(within(card).getByTestId('similar-axes')).toHaveTextContent(
      'même secteur que tes cibles · dans ta zone · taille que tu vises',
    )
    expect(within(card).queryByText(/non évalué/)).not.toBeInTheDocument()
  })

  it('sans score (moins de trois axes renseignés), le panneau ne se tait pas : il nomme les axes qui manquent', async () => {
    suggestions = [
      suggestion(1, {
        similarity_reasons: ['sector'],
        similarity_unevaluated: ['geo', 'size'],
        similarity_confidence: 'partielle',
      }),
    ]
    renderWithRouter(<SimilarPanel />)
    await screen.findByText('Société 1')

    const card = cardOf('Société 1')
    // Aucun niveau : il n'y a pas de score à résumer.
    expect(within(card).queryByText(/Recoupe/)).not.toBeInTheDocument()
    expect(within(card).getByTestId('similar-axes')).toHaveTextContent(
      'même secteur que tes cibles · non évalué : ta zone, la taille visée — tu ne l’as pas encore renseigné',
    )
  })

  it('témoin — une réponse d’API antérieure aux champs : ni niveau ni ligne vide', async () => {
    suggestions = [suggestion(1)]
    renderWithRouter(<SimilarPanel />)
    await screen.findByText('Société 1')

    const card = cardOf('Société 1')
    expect(within(card).queryByTestId('similar-axes')).not.toBeInTheDocument()
    expect(within(card).queryByText(/Recoupe/)).not.toBeInTheDocument()
  })
})
