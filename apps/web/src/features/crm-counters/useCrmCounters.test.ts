import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { fetchCrmCounters } from './useCrmCounters'

describe('#4193 — fetchCrmCounters', () => {
  beforeEach(() => apiFetch.mockReset())

  it('refuse une réponse sans compteurs plutôt que de la laisser faire tomber l’écran', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    await expect(fetchCrmCounters()).rejects.toThrow(/sans compteurs/)
  })

  it('rend la réponse quand elle porte ses compteurs', async () => {
    const ok = { counters: { needs_open: { value: 2, measured: true, definition_key: 'needs_open' } } }
    apiFetch.mockResolvedValue(ok)
    await expect(fetchCrmCounters('own')).resolves.toBe(ok)
    expect(apiFetch).toHaveBeenCalledWith({ path: '/crm-counters?scope=own' })
  })
})
