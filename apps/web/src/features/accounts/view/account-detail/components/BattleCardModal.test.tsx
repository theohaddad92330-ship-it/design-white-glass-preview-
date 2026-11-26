import type { Account } from '@bellum/contracts'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BattlecardData } from '@/features/accounts/battlecard-compare.types'
import { BattleCardModal } from './BattleCardModal'

const mockBattlecard = vi.fn()
vi.mock('@/features/accounts/api', () => ({
  accountsApi: { battlecard: (...a: unknown[]) => mockBattlecard(...a) },
}))

const account = { id: 'a1', company_name: 'BNP Paribas' } as Account

const CARD: BattlecardData = {
  company_activity: 'Banque de détail',
  vs_competitors: [{ competitor: 'Capgemini', their_weaknesses: 'Cher', our_counter_angle: 'Spécialisation data' }],
  killer_question: 'Qui pilote la migration ?',
}

describe('BattleCardModal', () => {
  it('fetches the battle card on open and renders the competitive block', async () => {
    mockBattlecard.mockResolvedValueOnce({ success: true, data: CARD })
    render(<BattleCardModal account={account} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Capgemini')).toBeInTheDocument())
    expect(mockBattlecard).toHaveBeenCalledWith('a1')
    expect(screen.getByText('Nous vs concurrents')).toBeInTheDocument()
    expect(screen.getByText('Qui pilote la migration ?')).toBeInTheDocument()
  })

  it('shows an error state when generation fails (never a fabricated card)', async () => {
    mockBattlecard.mockRejectedValueOnce(new Error('boom'))
    render(<BattleCardModal account={account} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText(/indisponible pour l'instant/i)).toBeInTheDocument())
  })

  /**
   * Le modal se montait dans l'arbre de l'onglet, dont le conteneur porte un
   * `transform` : `position: fixed` se calait alors sur l'onglet (plus haut que la
   * fenêtre) et la carte partait hors écran — l'utilisateur ne voyait que le fond
   * flou. Le portail vers `document.body` est ce qui garantit qu'elle reste
   * centrée dans la FENÊTRE, quel que soit l'écran qui l'ouvre.
   */
  it('renders through a portal, outside the transformed tab subtree', async () => {
    mockBattlecard.mockResolvedValueOnce({ success: true, data: CARD })
    const host = document.createElement('div')
    host.style.transform = 'translate3d(0, 0, 0)'
    host.setAttribute('data-testid', 'transformed-host')
    document.body.appendChild(host)

    render(<BattleCardModal account={account} onClose={() => {}} />, { container: host })

    const dialog = await screen.findByRole('dialog')
    expect(host.contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)

    host.remove()
  })

  describe('état de génération', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('affiche la structure attendue et le temps écoulé pendant la génération', async () => {
      mockBattlecard.mockReturnValueOnce(new Promise(() => {}))
      render(<BattleCardModal account={account} onClose={() => {}} />)

      expect(screen.getByText(/Génération de la fiche/i)).toBeInTheDocument()
      // La progression est INDÉTERMINÉE : on ne connaît pas l'avancement réel côté
      // modèle, donc aucun pourcentage n'est affiché — il serait inventé.
      const progress = screen.getByRole('progressbar')
      expect(progress).not.toHaveAttribute('aria-valuenow')
      // Les sections de la fiche à venir sont annoncées, pour que l'attente montre
      // ce qui arrive plutôt qu'un fond vide.
      expect(screen.getByText('Activité concrète')).toBeInTheDocument()
      expect(screen.getByText('Nous vs concurrents')).toBeInTheDocument()

      expect(screen.getByText('0 s')).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(3000)
      await waitFor(() => expect(screen.getByText('3 s')).toBeInTheDocument())
    })
  })
})
