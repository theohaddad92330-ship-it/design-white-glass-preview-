import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signerSession } from '@/lib/session'

/**
 * #2905 (#2442.19) — LA MÊME PORTE, DEPUIS UN COMPOSANT SERVEUR.
 *
 * `journaliserAudit` (#1666) exige un `NextRequest`, qu'aucun composant
 * serveur ne porte — et c'est pourtant `AnalysisDetailPage` qui rend
 * `raw_analysis` cross-tenant EN ENTIER, jusqu'ici sans laisser de trace.
 * `journaliserAccesDepuisComposant` est la même porte, l'auteur relu depuis
 * le cookie signé plutôt que depuis une requête.
 */

const ORIGINE = { ...process.env }
let appels: { url: string; corps: Record<string, unknown> }[] = []

beforeEach(() => {
  vi.resetModules()
  appels = []
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test-suffisamment-long-pour-etre-realiste'
  process.env['API_BASE_URL'] = 'https://api.test'
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      appels.push({ url: String(url), corps: JSON.parse(String(init.body)) as Record<string, unknown> })
      return new Response('{"ok":true}', { status: 200 })
    }),
  )
})

afterEach(() => {
  process.env = { ...ORIGINE }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.doUnmock('next/headers')
})

function mockCookies(valeur?: string): void {
  vi.doMock('next/headers', () => ({
    cookies: async () => ({
      get: (nom: string) => (nom === 'dm_session' && valeur ? { value: valeur } : undefined),
    }),
  }))
}

describe('journaliserAccesDepuisComposant — auteur relu depuis le cookie, jamais bloquante', () => {
  it("l'auteur signé devient actorEmail/actorRole, comme journaliserAudit", async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:owner'
    const jeton = (await signerSession('louis@bellum-it.com')) ?? ''
    mockCookies(jeton)
    const { journaliserAccesDepuisComposant } = await import('@/lib/journal-audit')

    await journaliserAccesDepuisComposant({
      operation: 'analyses.raw_data_read',
      category: 'ordinaire',
      outcome: 'succes',
      subjectType: 'account',
      subjectId: 'acc-1',
      subjectLabel: 'ACME',
    })

    expect(appels).toHaveLength(1)
    expect(appels[0]?.corps).toMatchObject({
      operation: 'analyses.raw_data_read',
      category: 'ordinaire',
      actorEmail: 'louis@bellum-it.com',
      actorRole: 'owner',
      subjectType: 'account',
      subjectId: 'acc-1',
      subjectLabel: 'ACME',
    })
  })

  it('couche d’identité au repos (sans DM_ALLOWED_EMAILS) : actorEmail null, jamais « inconnu »', async () => {
    delete process.env['DM_ALLOWED_EMAILS']
    mockCookies(undefined)
    const { journaliserAccesDepuisComposant } = await import('@/lib/journal-audit')

    await journaliserAccesDepuisComposant({
      operation: 'analyses.raw_data_read',
      category: 'ordinaire',
      subjectType: 'account',
      subjectId: 'acc-1',
    })

    expect(appels[0]?.corps).toMatchObject({ actorEmail: null, actorRole: null })
  })

  it('sans configuration (base/secret absents) : zéro appel réseau — sans clé = no-op strict', async () => {
    delete process.env['API_BASE_URL']
    mockCookies(undefined)
    const { journaliserAccesDepuisComposant } = await import('@/lib/journal-audit')

    await journaliserAccesDepuisComposant({ operation: 'analyses.raw_data_read', category: 'ordinaire' })

    expect(appels).toHaveLength(0)
  })

  it('jamais bloquante : un `cookies()` qui jette (hors contexte de requête) ne fait pas tomber l’appelant', async () => {
    vi.doMock('next/headers', () => ({
      cookies: async () => {
        throw new Error('cookies() was called outside a request scope.')
      },
    }))
    const { journaliserAccesDepuisComposant } = await import('@/lib/journal-audit')

    await expect(
      journaliserAccesDepuisComposant({ operation: 'analyses.raw_data_read', category: 'ordinaire' }),
    ).resolves.toBeUndefined()
    // La ligne part quand même, sans auteur — une trace, pas une porte.
    expect(appels[0]?.corps).toMatchObject({ actorEmail: null })
  })

  it('jamais bloquante : le fetch qui échoue ne jette pas', async () => {
    mockCookies(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('réseau down')
      }),
    )
    const { journaliserAccesDepuisComposant } = await import('@/lib/journal-audit')

    await expect(
      journaliserAccesDepuisComposant({ operation: 'analyses.raw_data_read', category: 'ordinaire' }),
    ).resolves.toBeUndefined()
  })
})
