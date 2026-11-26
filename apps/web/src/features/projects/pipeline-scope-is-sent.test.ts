import { describe, expect, it, vi } from 'vitest'

/**
 * LA PORTÉE DU PIPE PART VRAIMENT DANS LA REQUÊTE.
 *
 * `GET /projects/pipeline` accepte `?scope=own` depuis le 28/08
 * (`fix(cockpit): « Mon pipe » et « Mes missions » sont vraiment les miennes`,
 * a1f30e39b) — et son propre commentaire annonce que le cockpit (« **Mon**
 * pipe ») demande le sien. Il ne le demandait pas : `usePipeline()` construisait
 * l'URL sans le paramètre, et `MyActivityBlock` l'appelait sans argument. Le
 * cockpit d'un commercial affichait donc le pipe de TOUT l'espace sous le mot
 * « Mon ».
 *
 * C'est la cause racine « paramètre déclaré, jamais passé », au même endroit où
 * `finance-scope-is-sent.test.ts` l'a déjà trouvée sur le chiffre d'affaires : la
 * moitié serveur livrée, la moitié client absente, et rien de rouge pour le
 * dire — un chiffre juste pour l'espace ressemble exactement à un chiffre juste
 * pour soi quand on ne connaît pas la bonne réponse.
 *
 * Deux choses sont vérifiées ici, et la seconde compte autant que la première :
 * que le paramètre PART, et que la portée entre dans la CLÉ DE CACHE. Sans
 * elle, `/projects` (l'espace) et le cockpit (soi) partagent une entrée, et le
 * premier des deux écrans ouvert décide de ce que l'autre affiche.
 */
const fetched: string[] = []
vi.mock('@/lib/api', () => ({
  apiFetch: ({ path }: { path: string }) => {
    fetched.push(path)
    return Promise.resolve({})
  },
}))

const { projectsApi, projectQueryKeys } = await import('./api')

describe('la portée du pipe voyage jusqu’au serveur', () => {
  it('« Mon pipe » demande `scope=own`, et l’espace ne demande rien', async () => {
    fetched.length = 0
    await projectsApi.pipeline('fr', 'own')
    await projectsApi.pipeline('fr')

    expect(fetched[0]).toContain('scope=own')
    expect(fetched[0]).toContain('lang=fr')
    // L'espace n'envoie RIEN : une portée absente et une portée « espace »
    // explicite sont deux requêtes différentes, et le serveur n'en connaît
    // qu'une. Envoyer `scope=workspace` inventerait une valeur.
    expect(fetched[1]).not.toContain('scope')
  })

  it('la portée entre dans la clé de cache — sinon un écran répond pour l’autre', () => {
    expect(projectQueryKeys.pipeline('fr', 'own')).not.toEqual(projectQueryKeys.pipeline('fr'))
  })
})
