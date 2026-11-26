import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2975 (#2440.83-89) — la console écrit les cinq leviers de coût d'UN espace. Le rôle se vérifie
 * ici, le corps est validé avant tout appel, et chaque écriture est journalisée.
 */

const exigerCapacite = vi.fn()
vi.mock('@/lib/guard', () => ({ exigerCapacite: (...args: unknown[]) => exigerCapacite(...args) }))

const journaliserAudit = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/journal-audit', () => ({ journaliserAudit: (...args: unknown[]) => journaliserAudit(...args) }))

const ORIGINE = { ...process.env }
const LEVIERS = {
  monthlyBudgetUsd: 120,
  perMemberCapUsd: null,
  perActionCapUsd: 3.5,
  alertOnOverage: true,
  blockAtCap: true,
}

async function put(id: string, body: unknown) {
  const { PUT } = await import('./route')
  const req = new NextRequest(`https://manager.test/api/admin/workspaces/${id}/budget`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const reponse = await PUT(req, { params: Promise.resolve({ id }) })
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

describe('PUT /api/admin/workspaces/[id]/budget (#2975)', () => {
  it('relaie les cinq leviers à PUT /internal/admin/workspaces/:id/budget et journalise', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { reponse } = await put('ws-1', LEVIERS)

    expect(reponse.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/internal/admin/workspaces/ws-1/budget')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual(LEVIERS)
    expect(exigerCapacite).toHaveBeenCalledWith(expect.anything(), 'workspaces.write')
    expect(journaliserAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: 'workspaces.budget.update', subjectType: 'workspace', subjectId: 'ws-1' }),
    )
  })

  it('NON — un rôle sans capacité n’atteint ni l’API ni le journal', async () => {
    const refus = new Response(JSON.stringify({ ok: false }), { status: 403 })
    exigerCapacite.mockResolvedValue(refus)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { reponse } = await put('ws-1', LEVIERS)

    expect(reponse.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(journaliserAudit).not.toHaveBeenCalled()
  })

  it.each([
    { ...LEVIERS, monthlyBudgetUsd: 0 },
    { ...LEVIERS, perActionCapUsd: -2 },
    { ...LEVIERS, blockAtCap: 'oui' },
    { monthlyBudgetUsd: 10 },
  ])('NON — un corps invalide est refusé en 400 avant tout appel (%j)', async corps => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { reponse } = await put('ws-1', corps)

    expect(reponse.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('une API injoignable se dit 502, sans fausse confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { reponse, corps } = await put('ws-1', LEVIERS)
    expect(reponse.status).toBe(502)
    expect(corps['ok']).toBe(false)
  })
})
