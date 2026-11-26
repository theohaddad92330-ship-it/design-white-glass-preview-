import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ranked: [] }),
  ApiError: class ApiError extends Error {},
}))

import { apiFetch } from '@/lib/api'
import { contactKeys, contactsApi } from './api'

/**
 * #2120.30 / .33 / .34 — les trois choix du commercial PARTENT vers l'API.
 * Le défaut déjà payé deux fois ici : un sérialiseur en liste blanche avale un
 * filtre, la clé de cache change, et la requête repart… vers la même URL.
 */
describe('contactsApi.rankByAccount', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear()
  })

  it('envoie le périmètre, le sujet et l’offre, encodés', async () => {
    await contactsApi.rankByAccount('acc-1', { perimeter: 'Filiale Retail', subject: 'Data & IA', offer: 'Cloud' })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/contacts/account/acc-1/ranking?perimeter=Filiale+Retail&subject=Data+%26+IA&offer=Cloud',
    })
  })

  it('sans choix, aucune chaîne de requête', async () => {
    await contactsApi.rankByAccount('acc-1')
    expect(apiFetch).toHaveBeenCalledWith({ path: '/contacts/account/acc-1/ranking' })
  })

  it('la clé change avec chaque choix et vit sous le préfixe des contacts du compte', () => {
    const base = contactKeys.ranking('acc-1', {})
    expect(contactKeys.ranking('acc-1', { offer: 'Cloud' })).not.toEqual(base)
    expect(contactKeys.ranking('acc-1', { perimeter: 'X' })).not.toEqual(base)
    expect(base.slice(0, 3)).toEqual(contactKeys.byAccount('acc-1'))
  })
})
