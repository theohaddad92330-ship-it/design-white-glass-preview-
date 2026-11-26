import { describe, expect, it, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

/**
 * L'API rend `{ revoked, warning }` à la déconnexion d'Attio depuis qu'un lot a
 * établi qu'Attio ne documente AUCUN endpoint de révocation : l'accès reste
 * actif chez le fournisseur, et le dire est le seul comportement honnête.
 *
 * ⚠️ Ce que ce fichier garde était un défaut de TYPE, pas de comportement, et
 * il faut le dire pour que personne ne le « re-corrige » : `disconnect()` était
 * déclarée `Promise<void>` alors que le serveur envoie un corps. À l'exécution
 * l'avertissement passait déjà — la prop de `OAuthProviderCard` accepte
 * `Promise<{ warning } | void>` et lit `result?.warning`. Le risque était donc
 * DIFFÉRÉ : le jour où quelqu'un se fie au type déclaré pour simplifier, l'aveu
 * disparaît sans qu'aucun test d'exécution ne bronche. Ces deux tests sont le
 * témoin d'exécution ; l'honnêteté du type est tenue par `tsc`.
 */
describe('attioApi.disconnect', () => {
  beforeEach(() => apiFetch.mockReset())

  it('rend l’avertissement du serveur au lieu de le jeter', async () => {
    const { attioApi } = await import('./api')
    apiFetch.mockResolvedValue({ revoked: false, warning: 'Retire-le aussi depuis ton compte.' })
    await expect(attioApi.disconnect()).resolves.toEqual({
      revoked: false,
      warning: 'Retire-le aussi depuis ton compte.',
    })
    expect(apiFetch).toHaveBeenCalledWith({ path: '/attio', method: 'DELETE' })
  })

  it('n’invente rien quand le serveur ne rend pas de corps', async () => {
    const { attioApi } = await import('./api')
    apiFetch.mockResolvedValue(undefined)
    await expect(attioApi.disconnect()).resolves.toBeUndefined()
  })
})
