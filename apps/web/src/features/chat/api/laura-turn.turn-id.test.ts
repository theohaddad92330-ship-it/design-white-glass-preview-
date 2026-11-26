import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1952.10 — la carte EST un run, elle survit au rechargement.
 *
 * `withTurnCards` (`ia-proxy.controller.ts`) stampe `turn_id` sur l'événement
 * `done` — la moitié de la clé (`card:<turnId>:<rang>`) qui rattache les
 * cartes d'Action OS au message une fois enregistré (`POST /ia/chat/messages`,
 * `turnId`). Avant ce test, `laura-turn.ts` lisait `memory_turn_id` du même
 * événement mais jetait `turn_id` : la porte du tour ne le RENDAIT nulle part,
 * donc rien ne pouvait jamais l'envoyer à la persistance, et les cartes d'un
 * fil rechargé ne pouvaient jamais retrouver leur tour.
 */

vi.mock('@/lib/api', () => ({ refreshTokensOnce: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/api-origin', () => ({ apiBase: () => 'https://api.test' }))
vi.mock('@/features/auth/tab-identity', () => ({ readTabIdentity: () => null }))
vi.mock('@/features/auth/logged-in-cookie', () => ({ hasLoggedInCookie: () => false }))

const { askLauraStreaming, askLaura } = await import('./laura-turn')

const TURN = '22222222-2222-4222-8222-222222222222'

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

describe('laura-turn — le tour de la réponse (#1952.10)', () => {
  it('rend le tour porté par l’événement terminal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamOf({ success: true, data: { reply: 'Bonjour', turn_id: TURN } }),
    )
    await expect(askLauraStreaming(request)).resolves.toMatchObject({ reply: 'Bonjour', turnId: TURN })
  })

  it('pas de tour servi : la clé est absente, jamais une chaîne vide', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamOf({ success: true, data: { reply: 'Bonjour' } }))
    const reply = await askLauraStreaming(request)
    expect(reply).not.toHaveProperty('turnId')
  })

  it('NON — une valeur qui n’est pas une chaîne n’est pas un tour', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamOf({ success: true, data: { reply: 'Bonjour', turn_id: 42 } }),
    )
    expect(await askLaura(request)).not.toHaveProperty('turnId')
  })
})

describe('laura-turn — le tour EN ARRIÈRE-PLAN (#4967, lot L6)', () => {
  const bodyOf = (fetchMock: { mock: { calls: unknown[][] } }) =>
    JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<string, unknown>

  it('le tour part avec SON identifiant et le drapeau `background` : « Arrêter » le retrouve côté serveur', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(streamOf({ success: true, data: { reply: 'ok' } }))
    await askLauraStreaming({ ...request, turnId: TURN, background: true })
    expect(bodyOf(fetchMock)).toMatchObject({ turnId: TURN, background: true })
  })

  it('NON — sans eux (la bulle), les clés sont OMISES : D8, la fermeture annule', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(streamOf({ success: true, data: { reply: 'ok' } }))
    await askLaura(request)
    expect(bodyOf(fetchMock)).not.toHaveProperty('turnId')
    expect(bodyOf(fetchMock)).not.toHaveProperty('background')
  })
})
