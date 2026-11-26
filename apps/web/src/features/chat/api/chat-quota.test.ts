import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { fetchChatQuota } from './chat-quota'

/**
 * #1957.5 — la lecture du plafond est une ANNONCE : elle ne fait jamais tomber
 * l'écran, et ce qu'elle ne peut pas lire vaut `null` (l'écran se tait), jamais
 * un « 0 restant ».
 */
describe('fetchChatQuota', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('lit GET /ia/chat/quota et rend l’état validé', async () => {
    const status = { state: 'measured', limit: 50, remaining: 4, low: true, reopensAt: null }
    vi.mocked(apiFetch).mockResolvedValue(status)

    await expect(fetchChatQuota()).resolves.toEqual(status)
    expect(apiFetch).toHaveBeenCalledWith({ path: '/ia/chat/quota' })
  })

  it('une réponse hors contrat vaut null', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ remaining: 0 })

    await expect(fetchChatQuota()).resolves.toBeNull()
  })

  it('une requête en échec vaut null, sans jeter', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('réseau'))

    await expect(fetchChatQuota()).resolves.toBeNull()
  })
})
