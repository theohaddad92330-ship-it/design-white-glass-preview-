import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchChatTurnReplay } from '@/lib/chat-turn'
import ChatTurnReplayPage from './page'

// Même contournement que `analysis/[id]/page.test.tsx` : le lanceur de tests
// retombe sur le runtime JSX classique.
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('@/lib/chat-turn', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/chat-turn')>()),
  fetchChatTurnReplay: vi.fn(),
}))

const fetchReplay = vi.mocked(fetchChatTurnReplay)

// #2905 (#2442.16) — REPLAY EN LECTURE SEULE : l'écran ne fait que RENDRE ce
// que la route API a lu, il n'appelle jamais un outil, ne débite rien, n'
// envoie rien — il n'a d'ailleurs aucun bouton d'action.
describe('ChatTurnReplayPage', () => {
  beforeEach(() => {
    fetchReplay.mockReset()
  })

  it('rend les messages du tour dans l’ordre reçu', async () => {
    fetchReplay.mockResolvedValue([
      {
        id: 'm1',
        role: 'user',
        content: 'Relance TF1 ?',
        createdAt: '2026-09-26T10:00:00.000Z',
        context: null,
        attachments: null,
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Voici la relance proposée.',
        createdAt: '2026-09-26T10:00:02.000Z',
        context: null,
        attachments: null,
      },
    ])

    const html = renderToStaticMarkup(await ChatTurnReplayPage({ params: Promise.resolve({ id: 'turn-1' }) }))

    expect(html).toContain('Relance TF1 ?')
    expect(html).toContain('Voici la relance proposée.')
    expect(html).toContain('turn-1')
  })

  it('un tour introuvable rend un message d’erreur, jamais un écran vide silencieux', async () => {
    fetchReplay.mockRejectedValue(new Error('Chat turn replay endpoint returned 404 Not Found'))

    const html = renderToStaticMarkup(await ChatTurnReplayPage({ params: Promise.resolve({ id: 'inconnu' }) }))

    expect(html).toContain('indisponible')
  })
})
