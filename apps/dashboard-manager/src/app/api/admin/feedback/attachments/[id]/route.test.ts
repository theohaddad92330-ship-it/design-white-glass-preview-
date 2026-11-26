import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2444.12 — même trace que `capture/[id]/route.test.ts` : un GET sur les
 * pièces jointes d'un retour (donnée personnelle) journalise l'accès.
 */

const exigerCapacite = vi.fn()
vi.mock('@/lib/guard', () => ({ exigerCapacite: (...args: unknown[]) => exigerCapacite(...args) }))

const journaliserAudit = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/journal-audit', () => ({ journaliserAudit: (...args: unknown[]) => journaliserAudit(...args) }))

const ORIGINE = { ...process.env }

async function get(id: string) {
  const { GET } = await import('./route')
  const req = new NextRequest(`https://manager.test/api/admin/feedback/attachments/${id}`)
  const reponse = await GET(req, { params: Promise.resolve({ id }) })
  return { reponse, corps: (await reponse.json()) as Record<string, unknown> }
}

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

describe('GET /api/admin/feedback/attachments/[id] (#2444.12)', () => {
  it('journalise la consultation des pièces jointes — sujet, id, jamais le lien', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ attachments: [{ name: 'capture.png', url: 'https://cdn.test/a.png' }] }), {
          status: 200,
        }),
      ),
    )

    const { reponse, corps } = await get('fb-1')

    expect(reponse.status).toBe(200)
    expect(corps['ok']).toBe(true)
    expect(journaliserAudit).toHaveBeenCalledTimes(1)
    const [, geste] = journaliserAudit.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(geste).toMatchObject({
      operation: 'feedback.attachments_view',
      category: 'ordinaire',
      subjectType: 'beta_feedback',
      subjectId: 'fb-1',
      statusCode: 200,
      detail: '1 pièce(s) consultée(s)',
    })
    expect(JSON.stringify(geste)).not.toContain('cdn.test')
  })

  it('un refus de rôle ne journalise rien ici — `exigerCapacite` a déjà tracé son refus', async () => {
    exigerCapacite.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 403 }))

    await get('fb-2')

    expect(journaliserAudit).not.toHaveBeenCalled()
  })
})
