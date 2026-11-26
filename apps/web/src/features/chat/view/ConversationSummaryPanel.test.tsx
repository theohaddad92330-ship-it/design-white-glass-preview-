import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ConversationMenu } from './ConversationMenu'

/** #3775.1 — les trois anciens déclencheurs vivent désormais dans UN menu « Conversation » : on l'ouvre, puis l'onglet. */
async function openTab(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
  await userEvent.click(await screen.findByRole('tab', { name }))
}

/**
 * #2112 — RECETTE IPHONE DU 25/09 : L'EN-TÊTE « RÉSUMÉ / PARTICIPANTS »
 * DÉBORDE À DROITE SOUS 768PX.
 *
 * Le déclencheur portait une icône ET son libellé (`icon={NotebookText}` +
 * `{t('summary.action')}`) — sur la rangée d'en-tête, à côté du même patron
 * pour « Participants » et deux autres déclencheurs, ça ne tient pas sur
 * 375px. Sous 768px seulement (`useIsMobile`), le bouton perd son texte visible et
 * gagne un `aria-label` — l'icône seule, nommée (GA-32). Desktop inchangé :
 * le libellé reste visible, aucun `aria-label` ajouté (le texte visible
 * porte déjà le nom accessible).
 *
 * Même faux `matchMedia` que `SidebarCollapse.test.tsx` — jsdom ne
 * l'implémente pas.
 */
function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

/**
 * #1955.30 / #1955.31 — le résumé roulant du fil OUVERT, lisible (et
 * corrigeable) dans `/chat` — pas seulement dans Réglages › Mémoire de Laura.
 */
describe('ConversationSummaryPanel', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('reads the thread’s summary only once the panel is opened', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      summary: { summary: 'Bonjour, priorise EDF.', updatedAt: '2026-09-16T10:00:00Z' },
    })
    renderWithRouter(<ConversationMenu hasExchange accountId={null} conversationId="general" sources={[]} />)

    expect(apiFetch).not.toHaveBeenCalled()
    await openTab('Résumé')

    expect(await screen.findByText('Bonjour, priorise EDF.')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/memory/summary?conversationId=general' })
  })

  it('says honestly that there is no summary yet — never a blank invented one', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ summary: null })
    renderWithRouter(<ConversationMenu hasExchange accountId={null} conversationId="general" sources={[]} />)

    await openTab('Résumé')

    expect(await screen.findByText('Aucun résumé pour ce fil pour l’instant.')).toBeInTheDocument()
    // Rien à corriger : le bouton « Modifier » ne s'affiche pas sur un résumé absent.
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
  })

  it('corrects the summary — a human correction always wins', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      summary: { summary: 'Un résumé bancal', updatedAt: '2026-09-16T10:00:00Z' },
    })
    renderWithRouter(<ConversationMenu hasExchange accountId={null} conversationId="general" sources={[]} />)
    await openTab('Résumé')
    await screen.findByText('Un résumé bancal')

    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const field = screen.getByLabelText('Texte du résumé')
    await userEvent.clear(field)
    await userEvent.type(field, 'Le bon résumé')

    vi.mocked(apiFetch).mockResolvedValueOnce({
      summary: { summary: 'Le bon résumé', updatedAt: '2026-09-16T11:00:00Z' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/memory/summary',
        method: 'PATCH',
        body: { summary: 'Le bon résumé', conversationId: 'general' },
      }),
    )
  })
})

// #5047 (revient sur #2112) — le déclencheur n'est plus sur la rangée d'en-tête : c'est une LIGNE du menu ⋯
// (`ConversationHeaderMenu`). Le débordement de #2112 a disparu avec la rangée ; la ligne garde son libellé
// visible à toutes les largeurs, comme Partager et Exporter (#4885/#4904/#4910 défaits par #5047).
describe('#5047 — le déclencheur, ligne du menu ⋯, garde son libellé visible', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('garde son texte visible sous 768px (ligne de menu, plus d’icône seule)', async () => {
    stubMatchMedia(true)
    renderWithRouter(<ConversationMenu hasExchange accountId={null} conversationId="general" sources={[]} />)

    const trigger = await screen.findByRole('button', { name: 'Conversation' })
    expect(trigger.textContent).toBe('Conversation')
  })

  it('garde son texte visible sur le bureau — non-régression', async () => {
    stubMatchMedia(false)
    renderWithRouter(<ConversationMenu hasExchange accountId={null} conversationId="general" sources={[]} />)

    const trigger = await screen.findByRole('button', { name: 'Conversation' })
    expect(trigger.textContent).toBe('Conversation')
    expect(trigger).not.toHaveAttribute('aria-label')
  })
})
