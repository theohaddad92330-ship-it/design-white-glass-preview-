import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2444.12 — un GET sur une capture d'écran CLIENT journalise l'accès, même
 * quand `journal-audit-a-des-ecrivains.test.ts` ne l'exige que des verbes
 * mutants. Le test « sait dire NON » : retirer l'appel à `journaliserAudit`
 * du gestionnaire fait chuter ces deux tests.
 */

const exigerCapacite = vi.fn()
vi.mock('@/lib/guard', () => ({ exigerCapacite: (...args: unknown[]) => exigerCapacite(...args) }))

const journaliserAudit = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/journal-audit', () => ({ journaliserAudit: (...args: unknown[]) => journaliserAudit(...args) }))

const ORIGINE = { ...process.env }

function requete(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function get(id: string) {
  const { GET } = await import('./route')
  const req = new NextRequest(`https://manager.test/api/admin/feedback/capture/${id}`)
  const reponse = await GET(req, requete(id))
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

describe('GET /api/admin/feedback/capture/[id] (#2444.12)', () => {
  it('journalise la consultation d’une capture — sujet, id, jamais le contenu', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ screenshot_url: 'https://cdn.test/x.png' }), { status: 200 })),
    )

    const { reponse, corps } = await get('fb-1')

    expect(reponse.status).toBe(200)
    expect(corps).toEqual({ ok: true, screenshotUrl: 'https://cdn.test/x.png' })
    expect(journaliserAudit).toHaveBeenCalledTimes(1)
    const [, geste] = journaliserAudit.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(geste).toMatchObject({
      operation: 'feedback.screenshot_view',
      category: 'ordinaire',
      subjectType: 'beta_feedback',
      subjectId: 'fb-1',
      statusCode: 200,
    })
    // Le contenu de la capture ne voyage jamais dans le journal.
    expect(JSON.stringify(geste)).not.toContain('cdn.test')
  })

  it('journalise aussi l’absence de capture — l’accès a eu lieu même sans donnée', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ screenshot_url: null }), { status: 200 })),
    )

    await get('fb-2')

    expect(journaliserAudit).toHaveBeenCalledTimes(1)
    const [, geste] = journaliserAudit.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(geste).toMatchObject({ subjectId: 'fb-2', detail: 'Aucune capture pour ce retour' })
  })

  it('un refus de rôle ne journalise rien ici — `exigerCapacite` a déjà tracé son refus', async () => {
    exigerCapacite.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 403 }))

    await get('fb-3')

    expect(journaliserAudit).not.toHaveBeenCalled()
  })
})
