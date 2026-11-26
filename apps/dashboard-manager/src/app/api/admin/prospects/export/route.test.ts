import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DemoLead } from '@/lib/demo-leads'

/**
 * #4387 — l'export CSV des prospects : même autorisation que la liste
 * (`leads.read`), jamais public, journalisé sans les données, panne ≠ fichier vide.
 */
const exigerCapacite = vi.fn()
vi.mock('@/lib/guard', () => ({ exigerCapacite: (...args: unknown[]) => exigerCapacite(...args) }))

const journaliserAudit = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/journal-audit', () => ({ journaliserAudit: (...args: unknown[]) => journaliserAudit(...args) }))

const fetchDemoLeads = vi.fn()
vi.mock('@/lib/demo-leads', () => ({ fetchDemoLeads: () => fetchDemoLeads() }))

const LEAD: DemoLead = {
  id: 'l1',
  firstName: 'Camille',
  lastName: 'Durand',
  email: 'camille@acme.fr',
  jobTitle: 'manager',
  company: 'Acme',
  firstAccessAt: '2026-10-19T08:30:00.000Z',
  lastAccessAt: '2026-10-20T13:05:00.000Z',
  accessCount: 2,
  source: 'demo',
}

async function appeler() {
  const { GET } = await import('./route')
  return GET(new NextRequest('https://manager.test/api/admin/prospects/export'))
}

vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.clearAllMocks()
  exigerCapacite.mockResolvedValue(null)
  journaliserAudit.mockResolvedValue(undefined)
  fetchDemoLeads.mockResolvedValue([LEAD, { ...LEAD, id: 'l2', email: 'bob@acme.fr' }])
})

describe('GET /api/admin/prospects/export (#4387)', () => {
  it('exige la capacité de la LISTE (leads.read) avant tout', async () => {
    exigerCapacite.mockResolvedValue(NextResponse.json({ ok: false }, { status: 403 }))
    const res = await appeler()
    expect(exigerCapacite).toHaveBeenCalledWith(expect.anything(), 'leads.read')
    expect(res.status).toBe(403)
    expect(fetchDemoLeads).not.toHaveBeenCalled()
    expect(journaliserAudit).not.toHaveBeenCalled()
  })

  it('rend un CSV téléchargeable avec toutes les lignes', async () => {
    const res = await appeler()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="prospects-\d{4}-\d{2}-\d{2}\.csv"$/)
    const texte = await res.text()
    expect(texte).toContain('camille@acme.fr')
    expect(texte).toContain('bob@acme.fr')
  })

  it('journalise qui/combien — jamais les données', async () => {
    await appeler()
    expect(journaliserAudit).toHaveBeenCalledTimes(1)
    const geste = journaliserAudit.mock.calls[0]?.[1] as { operation: string; category: string; detail: string }
    expect(geste.operation).toBe('prospects.export')
    expect(geste.category).toBe('export')
    expect(geste.detail).toContain('2')
    expect(JSON.stringify(geste)).not.toContain('camille')
    expect(JSON.stringify(geste)).not.toContain('acme')
  })

  it('une panne de l’API rend 502, pas un fichier vide, et ne journalise aucun export', async () => {
    fetchDemoLeads.mockRejectedValue(new Error('boom'))
    const res = await appeler()
    expect(res.status).toBe(502)
    expect(journaliserAudit).not.toHaveBeenCalled()
  })
})
