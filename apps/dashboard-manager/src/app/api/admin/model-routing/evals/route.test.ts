import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2975 (#2440.82) — la console déclare qu'une destination de routage a été
 * réévaluée. Le rôle se vérifie ici, le corps est validé avant tout appel,
 * `declaredBy` vient de l'identité Basic-Auth (jamais du formulaire), et
 * chaque écriture est journalisée.
 */

const exigerCapacite = vi.fn()
vi.mock('@/lib/guard', () => ({
  exigerCapacite: (...args: unknown[]) => exigerCapacite(...args),
  acteurDepuisBasicAuth: () => 'matteo@bellum-it.com',
}))

const journaliserAudit = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/journal-audit', () => ({ journaliserAudit: (...args: unknown[]) => journaliserAudit(...args) }))

const ORIGINE = { ...process.env }

async function poster(body: unknown) {
  const { POST } = await import('./route')
  const req = new NextRequest('https://manager.test/api/admin/model-routing/evals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const reponse = await POST(req)
  return { reponse, corps: (await reponse.json()) as Record<string, unknown> }
}

// Le premier import de la route charge `@/lib/admin` et ses dépendances : plus de 5 s à froid.
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.clearAllMocks()
  exigerCapacite.mockResolvedValue(null)
  journaliserAudit.mockResolvedValue(undefined)
  process.env['API_BASE_URL'] = 'https://api.test'
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test'
})

afterEach(() => {
  process.env = { ...ORIGINE }
  vi.unstubAllGlobals()
})

describe('POST /api/admin/model-routing/evals (#2975 / #2440.82)', () => {
  it('relaie destinationKey/note à l’API, et declaredBy vient du Basic-Auth jamais du corps', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { reponse } = await poster({ destinationKey: 'openai:gpt-4o', note: 'rejoué 08/10', declaredBy: 'intrus' })

    expect(reponse.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/internal/admin/model-routing/evals')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      destinationKey: 'openai:gpt-4o',
      declaredBy: 'matteo@bellum-it.com',
      note: 'rejoué 08/10',
    })
    expect(exigerCapacite).toHaveBeenCalledWith(expect.anything(), 'model_routing.write')
    expect(journaliserAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operation: 'model_routing.evals.declare',
        subjectType: 'model_routing_destination',
        subjectId: 'openai:gpt-4o',
      }),
    )
  })

  it('NON — un rôle sans capacité n’atteint ni l’API ni le journal', async () => {
    const refus = new Response(JSON.stringify({ ok: false }), { status: 403 })
    exigerCapacite.mockResolvedValue(refus)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { reponse } = await poster({ destinationKey: 'openai' })

    expect(reponse.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(journaliserAudit).not.toHaveBeenCalled()
  })

  it.each([{ destinationKey: '   ' }, { note: 'sans cible' }, {}])(
    'NON — un corps invalide est refusé en 400 avant tout appel (%j)',
    async corps => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { reponse } = await poster(corps)

      expect(reponse.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('une API injoignable se dit 502, sans fausse confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { reponse, corps } = await poster({ destinationKey: 'openai' })
    expect(reponse.status).toBe(502)
    expect(corps['ok']).toBe(false)
  })
})
