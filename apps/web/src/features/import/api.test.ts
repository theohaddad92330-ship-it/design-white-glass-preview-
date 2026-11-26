import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importApi } from './api'

const mockApiFetch = vi.fn()

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

/**
 * #3753.1 — « créer une liste cible » part avec l'application de l'import, et
 * seulement quand l'utilisateur l'a demandé : sans le geste, le corps est celui
 * d'avant (aucune liste, aucune analyse).
 */
describe('importApi.apply — liste cible (#3753)', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue({})
  })

  it('envoie le nom de la liste cible quand elle est demandée', async () => {
    await importApi.apply('s1', 'a;b', ['account'], undefined, { name: 'Ciblage 2026' })
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/import/sessions/s1/apply',
        body: { content: 'a;b', available: ['account'], targetList: { name: 'Ciblage 2026' } },
      }),
    )
  })

  it('sans demande, le corps est inchangé — aucune clé targetList', async () => {
    await importApi.apply('s1', 'a;b', ['account'])
    const call = mockApiFetch.mock.calls[0]![0] as { body: Record<string, unknown> }
    expect(call.body).toEqual({ content: 'a;b', available: ['account'] })
    expect('targetList' in call.body).toBe(false)
  })
})
