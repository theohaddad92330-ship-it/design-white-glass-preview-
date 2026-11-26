/**
 * #1953.1 / #1953.2 — la porte du tour transmet le signal d'arrêt à la requête.
 *
 * `askLauraStreaming` accepte un `AbortSignal` optionnel en troisième
 * argument, posé sur `fetch` (via `openChatStream`). C'est ce qui permet à
 * l'écran `/chat` (Chat.tsx) d'interrompre une génération en cours sur un
 * clic « Arrêter » : le flux SSE en cours de lecture rejette alors avec une
 * `AbortError`, sans jamais inventer un succès.
 *
 * `askLaura` (la bulle flottante, bufferisée) n'a pas de bouton d'arrêt et ne
 * reçoit donc pas de signal — ce fichier ne teste que `askLauraStreaming`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { askLauraStreaming } from './laura-turn'

function mockStreamResponse(): Response {
  const encoder = new TextEncoder()
  const frame = `data: ${JSON.stringify({ type: 'done', success: true, data: { reply: 'ok' } })}\n\n`
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

describe('#1953.2 — le signal transite jusqu’au fetch sous-jacent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pose `signal` sur la requête HTTP quand il est fourni', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await askLauraStreaming(
      { message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] },
      {},
      controller.signal,
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  it('sans signal fourni, le comportement est identique à avant ce lot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await askLauraStreaming({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeUndefined()
  })

  it('un arrêt déclenché pendant le flux rejette avec une AbortError — jamais un succès inventé', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = askLauraStreaming(
      { message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] },
      {},
      controller.signal,
    )
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
