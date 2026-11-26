import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1916.24 — le TOUR émis par le serveur voyage dans l'événement terminal du
 * flux (`memory_turn_id`). La porte du tour le rend à l'écran, qui l'envoie avec
 * la réponse enregistrée : c'est ce qui rattache la trace à CE message.
 */

vi.mock('@/lib/api', () => ({ refreshTokensOnce: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/api-origin', () => ({ apiBase: () => 'https://api.test' }))
vi.mock('@/features/auth/tab-identity', () => ({ readTabIdentity: () => null }))
vi.mock('@/features/auth/logged-in-cookie', () => ({ hasLoggedInCookie: () => false }))

const { askLauraStreaming, askLaura } = await import('./laura-turn')

const TURN = '11111111-1111-4111-8111-111111111111'

function streamOf(done: Record<string, unknown>): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: 'Bonjour' })}\n\n`))
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', ...done })}\n\n`))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const request = { message: 'hi', accountId: null, conversationId: 'general', history: [] }

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('laura-turn — le tour de mémoire de la réponse', () => {
  it('rend le tour porté par l’événement terminal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamOf({ success: true, data: { reply: 'Bonjour', memory_turn_id: TURN } }),
    )
    await expect(askLauraStreaming(request)).resolves.toMatchObject({ reply: 'Bonjour', memoryTurnId: TURN })
  })

  it('pas de tour servi : la clé est absente, jamais une chaîne vide', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamOf({ success: true, data: { reply: 'Bonjour' } }))
    const reply = await askLauraStreaming(request)
    expect(reply).not.toHaveProperty('memoryTurnId')
  })

  it('NON — une valeur qui n’est pas une chaîne n’est pas un tour', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamOf({ success: true, data: { reply: 'Bonjour', memory_turn_id: 42 } }),
    )
    expect(await askLaura(request)).not.toHaveProperty('memoryTurnId')
  })
})
