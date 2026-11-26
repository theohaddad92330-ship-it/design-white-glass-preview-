import { beforeEach, describe, expect, it, vi } from 'vitest'

/** #4742 — le client appelle la route du compte, et rend la réponse telle quelle (jamais un repli). */
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

describe('accountsApi.getTechStructure', () => {
  beforeEach(() => apiFetch.mockReset())

  it('lit GET /accounts/:id/tech-structure', async () => {
    const { accountsApi } = await import('./api')
    const structure = { axes: [], observed_axes: [], not_observed_axes: ['crm'] }
    apiFetch.mockResolvedValueOnce(structure)
    await expect(accountsApi.getTechStructure('acc-1')).resolves.toBe(structure)
    expect(apiFetch).toHaveBeenCalledWith({ path: '/accounts/acc-1/tech-structure' })
  })

  it('laisse remonter l’erreur de l’API, sans valeur de repli', async () => {
    const { accountsApi } = await import('./api')
    apiFetch.mockRejectedValueOnce(new Error('503'))
    await expect(accountsApi.getTechStructure('acc-1')).rejects.toThrow('503')
  })
})
