import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchManagerDependenciesStatus, testManagerDependency } from './manager-dependencies'

const REAL_ENV = process.env
const originalFetch = global.fetch

beforeEach(() => {
  process.env = { ...REAL_ENV }
  global.fetch = vi.fn()
})

afterEach(() => {
  process.env = REAL_ENV
  global.fetch = originalFetch
})

describe('fetchManagerDependenciesStatus', () => {
  it('sans API_BASE_URL/INTERNAL_API_SECRET, les 3 dépendances API sont NON MESURÉES (null), jamais false', async () => {
    delete process.env['API_BASE_URL']
    delete process.env['INTERNAL_API_SECRET']
    const statuses = await fetchManagerDependenciesStatus()
    const stripe = statuses.find(s => s.id === 'stripe')
    expect(stripe?.configured).toBeNull()
  })

  it('Supabase configuré localement, sans appel réseau pour cette ligne', async () => {
    process.env['SUPABASE_URL'] = 'https://x.supabase.co'
    process.env['SUPABASE_ANON_KEY'] = 'anon'
    delete process.env['API_BASE_URL']
    const statuses = await fetchManagerDependenciesStatus()
    expect(statuses.find(s => s.id === 'supabase')?.configured).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('une réponse API réussie reporte la présence mesurée de chaque dépendance', async () => {
    process.env['API_BASE_URL'] = 'https://api.test'
    process.env['INTERNAL_API_SECRET'] = 'secret'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        dependencies: [
          { id: 'stripe', configured: true },
          { id: 'resend', configured: false },
          { id: 'slack', configured: false },
        ],
      }),
    })
    const statuses = await fetchManagerDependenciesStatus()
    expect(statuses.find(s => s.id === 'stripe')?.configured).toBe(true)
    expect(statuses.find(s => s.id === 'resend')?.configured).toBe(false)
  })

  it('une panne API rend NON MESURÉ (null), jamais false', async () => {
    process.env['API_BASE_URL'] = 'https://api.test'
    process.env['INTERNAL_API_SECRET'] = 'secret'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'))
    const statuses = await fetchManagerDependenciesStatus()
    expect(statuses.find(s => s.id === 'stripe')?.configured).toBeNull()
  })
})

describe('testManagerDependency', () => {
  it('Supabase sans clé → non configuré, aucun appel réseau', async () => {
    delete process.env['SUPABASE_URL']
    const result = await testManagerDependency('supabase')
    expect(result.ok).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('Supabase configuré : un appel réel non destructif à /auth/v1/settings', async () => {
    process.env['SUPABASE_URL'] = 'https://x.supabase.co'
    process.env['SUPABASE_ANON_KEY'] = 'anon'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    const result = await testManagerDependency('supabase')
    expect(result.ok).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('https://x.supabase.co/auth/v1/settings', expect.any(Object))
  })

  it('Vercel sans jeton de test → non configuré, jamais "en erreur"', async () => {
    delete process.env['VERCEL_API_TOKEN']
    const result = await testManagerDependency('vercel')
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('non configuré')
  })

  it('GitHub sans commit connu → non configuré', async () => {
    delete process.env['VERCEL_GIT_COMMIT_SHA']
    const result = await testManagerDependency('github')
    expect(result.ok).toBe(false)
  })

  it('les dépendances API (stripe/resend/slack) proxient vers l’API', async () => {
    process.env['API_BASE_URL'] = 'https://api.test'
    process.env['INTERNAL_API_SECRET'] = 'secret'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ ok: true, detail: 'ok', checkedAt: '2026-09-09T00:00:00.000Z' }),
    })
    const result = await testManagerDependency('stripe')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/internal/admin/manager-dependencies/stripe/test',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.ok).toBe(true)
  })
})
