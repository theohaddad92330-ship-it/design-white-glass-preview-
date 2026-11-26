import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const putCachedEntity = vi.fn()
const getCachedEntity = vi.fn()
vi.mock('./repository', () => ({
  putCachedEntity: (...args: unknown[]) => putCachedEntity(...args),
  getCachedEntity: (...args: unknown[]) => getCachedEntity(...args),
}))

const { saveQuerySnapshot, toSnapshotKey } = await import('./query-snapshots')

/**
 * #2155 — écrire un instantané est un geste de CONFORT, jamais une dépendance
 * de l'écran qui l'écrit.
 *
 * Les onze appelants l'écrivent en `void saveQuerySnapshot(...)` : ils ne
 * l'attendent pas, mais `void` ne traite AUCUN rejet. Quand IndexedDB est
 * absent — un navigateur en navigation privée, un stockage bloqué par une
 * politique d'entreprise, et jsdom sous vitest —, `openDB` lève, la promesse
 * flottante est rejetée, et ce rejet n'a personne pour l'attraper : en CI il
 * a fait tomber le shard 3 entier (`ReferenceError: indexedDB is not defined`,
 * 3 754 tests VERTS et sortie 1) ; en production il remonte à Sentry comme une
 * panne de l'écran, alors que rien de ce que l'utilisateur voit n'a échoué.
 *
 * La politique « une écriture de cache qui échoue ne casse pas son appelant »
 * vit ICI, à un seul endroit, plutôt qu'en onze `.catch(() => {})` recopiés —
 * le douzième appelant serait écrit sans.
 */
describe('saveQuerySnapshot — une écriture de cache ne casse jamais son appelant', () => {
  beforeEach(() => {
    putCachedEntity.mockReset()
    getCachedEntity.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('résout quand le stockage est indisponible, au lieu de rejeter dans le vide', async () => {
    putCachedEntity.mockRejectedValue(new ReferenceError('indexedDB is not defined'))

    await expect(saveQuerySnapshot(['profile', 'me', 'u1'], { id: 'u1' })).resolves.toBeUndefined()
  })

  it('résout aussi quand le stockage lève AVANT de rendre sa promesse', async () => {
    // `getCacheDb()` lit `openDB` au premier appel : la référence manquante
    // lève de façon SYNCHRONE, et un `.catch()` posé sur la valeur de retour
    // ne l'aurait jamais vu.
    putCachedEntity.mockImplementation(() => {
      throw new ReferenceError('indexedDB is not defined')
    })

    await expect(saveQuerySnapshot(['accounts'], [])).resolves.toBeUndefined()
  })

  it('écrit vraiment quand le stockage répond — la garde n’est pas un no-op', async () => {
    putCachedEntity.mockResolvedValue(undefined)
    const key = ['profile', 'me', 'u1'] as const

    await saveQuerySnapshot(key, { id: 'u1' })

    expect(putCachedEntity).toHaveBeenCalledWith('query_snapshots', toSnapshotKey(key), {
      id: 'u1',
    })
  })
})
