import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useResearchModeStore } from '../researchModeStore'

const estimate = vi.fn()

vi.mock('@/features/chat/api/chatModeEstimateApi', () => ({
  chatModeEstimateApi: { estimate: (...args: unknown[]) => estimate(...args) },
}))

import { ResearchModeSelector } from './ResearchModeSelector'

function renderSelector(conversationId = 'c1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ResearchModeSelector conversationId={conversationId} />
    </QueryClientProvider>,
  )
}

/**
 * #3320 / #3321 — le sélecteur « mode de recherche » est PETIT et se place à
 * gauche de « Que puis-je demander ». Le déclencheur du `SelectField` est
 * `w-full` par défaut : dans la rangée `flex-wrap` du composeur, il prenait
 * une ligne entière et écrasait les amorces à côté (texte coupé, illisible).
 */
describe('ResearchModeSelector', () => {
  afterEach(() => {
    useResearchModeStore.setState({ modes: {} })
    estimate.mockReset()
  })

  it('ne prend pas toute la largeur de la rangée', () => {
    renderSelector()
    const trigger = screen.getByRole('combobox')
    expect(trigger.className).toContain('w-auto')
    expect(trigger.className).not.toMatch(/(^|\s)w-full(\s|$)/)
  })

  /**
   * #2448.8 / #2882.11 (épopée #2882) — « Vérifié estime coût et durée avant
   * le run » : Auto n'interroge jamais le serveur (rien à estimer, l'heuristique
   * décide seule).
   */
  it('Auto (par défaut) n’affiche aucune estimation et n’appelle pas le serveur', () => {
    renderSelector()

    expect(screen.queryByTestId('chat-research-mode-estimate')).not.toBeInTheDocument()
    expect(estimate).not.toHaveBeenCalled()
  })

  it('Vérifié affiche l’estimation du palier fort, une fois la mesure lue', async () => {
    useResearchModeStore.getState().setMode('c1', 'verifie')
    estimate.mockResolvedValue({
      estimate: { durationMs: 6_000, sampleSize: 12, cost: { measured: true, avgCostUsd: 0.02 } },
    })

    renderSelector()

    expect(estimate).toHaveBeenCalledWith('deep')
    await waitFor(() => expect(screen.getByTestId('chat-research-mode-estimate')).toHaveTextContent('6'))
  })

  it('Vérifié sans mesure encore assez nombreuse : « non mesuré », jamais un chiffre deviné', async () => {
    useResearchModeStore.getState().setMode('c1', 'verifie')
    estimate.mockResolvedValue({ estimate: null })

    renderSelector()

    await waitFor(() => expect(screen.getByTestId('chat-research-mode-estimate')).toBeInTheDocument())
    expect(screen.getByTestId('chat-research-mode-estimate').textContent).not.toMatch(/\d/)
  })

  it('Rapide (palier fast) n’affiche aucune estimation — jamais coûteux', () => {
    useResearchModeStore.getState().setMode('c1', 'rapide')

    renderSelector()

    expect(screen.queryByTestId('chat-research-mode-estimate')).not.toBeInTheDocument()
    expect(estimate).not.toHaveBeenCalled()
  })
  /**
   * #3774.2.2 — la phrase « Laura choisit la profondeur » ne s'affiche plus en permanence dans la
   * barre : le mode actif reste lisible sur le déclencheur, l'explication vit dans le menu Auto.
   */
  // #3774.2.2 revient sur #3709 (indice dans la barre), délibérément : l'explication vit dans le menu.
  it('#3774.2.2 — aucune phrase de politique permanente dans la barre, quel que soit le mode', () => {
    renderSelector()
    expect(screen.queryByTestId('chat-research-mode-policy')).not.toBeInTheDocument()
    expect(screen.queryByText(/choisit la profondeur/)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('Standard')
  })

  it('#3774.2.2 — l’explication d’Auto se retrouve dans le menu ouvert, pas dans le déclencheur', async () => {
    renderSelector()
    await userEvent.click(screen.getByRole('combobox'))
    const auto = screen.getByRole('option', { name: /Standard/ })
    expect(auto).toHaveTextContent(/choisit la profondeur/)
    expect(auto).not.toHaveTextContent(/recherche web/)
    expect(screen.getByRole('option', { name: /Rapide/ })).toHaveTextContent('sans recherche web')
    expect(screen.getByRole('option', { name: /Vérifié/ })).toHaveTextContent('recherche web permise')
  })

  it('#3774.2.2 — Rapide : la conséquence reste lisible au survol et propose Vérifié', () => {
    useResearchModeStore.getState().setMode('c1', 'rapide')
    renderSelector()
    const wrapper = screen.getByRole('combobox').parentElement as HTMLElement
    expect(wrapper.getAttribute('title')).toContain('sans recherche web')
    expect(wrapper.getAttribute('title')).toContain('Vérifié')
  })
})
