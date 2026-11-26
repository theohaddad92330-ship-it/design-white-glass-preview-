import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('@/lib/api')
vi.mock('@/lib/rate-limit-toast', () => ({ notifyIfRateLimited: vi.fn() }))
vi.mock('@/features/auth/logged-in-cookie', () => ({ hasLoggedInCookie: () => true }))

/**
 * Recette 14/10 : « Calcul du maillon faible en cours… » et « Chargement des
 * indicateurs… » restaient affichés sans fin. Cause : `apiFetch` n'avait AUCUN délai,
 * donc une requête qui ne répond jamais laissait la requête TanStack `pending` pour
 * toujours — jamais d'erreur, jamais d'état d'échec. `timeoutMs` (optionnel, absent =
 * comportement historique) transforme ce silence en échec que l'écran sait dire.
 */
describe('apiFetch — timeoutMs', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejette quand le serveur ne répond jamais', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )
    const { apiFetch } = await import('./api')
    await expect(apiFetch({ path: '/jamais', timeoutMs: 30 })).rejects.toBeTruthy()
  }, 10_000)

  it('sait dire NON : une réponse rapide passe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    )
    const { apiFetch } = await import('./api')
    await expect(apiFetch({ path: '/vite', timeoutMs: 5_000 })).resolves.toEqual({ ok: true })
  }, 10_000)
})
