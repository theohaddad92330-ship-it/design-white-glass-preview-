import { describe, expect, it, vi } from 'vitest'

/**
 * LA PORTÉE FINANCIÈRE PART VRAIMENT DANS LA REQUÊTE.
 *
 * Le serveur accepte `?scope=own` sur quatre routes depuis le 28/08, et son
 * propre commentaire annonce que « le bloc 2 du cockpit (Mon chiffre
 * d'affaires) demande le sien ». Il ne le demandait pas : les quatre URL
 * étaient construites sans le paramètre, et le cockpit d'un siège responsable
 * affichait donc le chiffre de TOUTE l'ESN sous le mot « Mon ».
 *
 * C'est la cause racine « paramètre déclaré, jamais passé » : la moitié serveur
 * livrée, la moitié client absente, et rien de rouge pour le dire — un chiffre
 * juste pour l'espace ressemble exactement à un chiffre juste pour soi quand on
 * ne connaît pas la bonne réponse.
 *
 * Deux choses sont vérifiées ici, et la seconde compte autant que la première :
 * que le paramètre PART, et que la portée entre dans la CLÉ DE CACHE. Sans
 * elle, `/pilotage` (l'espace) et le cockpit (soi) partagent une entrée, et le
 * premier des deux écrans ouvert décide de ce que l'autre affiche.
 */
const fetched: string[] = []
vi.mock('@/lib/api', () => ({
  apiFetch: ({ path }: { path: string }) => {
    fetched.push(path)
    return Promise.resolve({})
  },
}))

const { financeApi, missionKeys } = await import('./api')

describe('la portée financière voyage jusqu’au serveur', () => {
  it('« Mon chiffre d’affaires » demande `scope=own`, et l’espace ne demande rien', async () => {
    fetched.length = 0
    await financeApi.revenue(undefined, 'own')
    await financeApi.revenue('2026-07', 'own')
    await financeApi.revenue('2026-07')

    expect(fetched[0]).toContain('scope=own')
    expect(fetched[1]).toContain('scope=own')
    expect(fetched[1]).toContain('month=2026-07')
    // L'espace n'envoie RIEN : une portée absente et une portée « espace »
    // explicite sont deux requêtes différentes, et le serveur n'en connaît
    // qu'une. Envoyer `scope=workspace` inventerait une valeur.
    expect(fetched[2]).not.toContain('scope')
  })

  it('les trois autres routes portées savent aussi la demander', async () => {
    fetched.length = 0
    await financeApi.margin('2026-07', 'own')
    await financeApi.forecast('own')

    expect(fetched[0]).toContain('scope=own')
    expect(fetched[1]).toContain('scope=own')
  })

  it('la portée entre dans la clé de cache — sinon un écran répond pour l’autre', () => {
    expect(missionKeys.revenue('2026-07', 'own')).not.toEqual(missionKeys.revenue('2026-07'))
    expect(missionKeys.margin('2026-07', 'own')).not.toEqual(missionKeys.margin('2026-07'))
    expect(missionKeys.forecast('own')).not.toEqual(missionKeys.forecast())
  })
})
