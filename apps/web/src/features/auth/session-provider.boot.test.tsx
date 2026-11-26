import { describe, expect, it, vi } from 'vitest'

// perf P3 (29/09/2026) — la sonde `/version` ne doit plus précéder `/auth/session` :
// les deux partent au même tick. Le repli d'origine reste assuré par `apiFetch`
// (échec de transport sur une méthode sûre → rejeu par `/api`).
describe("amorçage de la session — la sonde n'est plus devant", () => {
  it('lance la sonde ET loadSession dans le même tick', async () => {
    vi.resetModules()
    const order: string[] = []
    vi.doMock('@/lib/api-origin', () => ({
      ensureApiReachable: vi.fn(() => {
        order.push('probe')
        return new Promise<void>(() => {}) // ne se résout jamais : loadSession ne doit pas l'attendre
      }),
    }))
    vi.doMock('./session-manager', () => ({
      sessionManager: {
        loadSession: vi.fn(() => {
          order.push('session')
          return Promise.resolve()
        }),
        subscribe: vi.fn(),
        getState: vi.fn(),
      },
    }))
    await import('./session-provider')
    expect(order).toEqual(['probe', 'session'])
  })
})
