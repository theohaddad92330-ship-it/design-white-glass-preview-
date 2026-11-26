import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `src/test/setup.ts` remplace `@/lib/api` par un mock pour toute la suite —
// sans quoi la collecte des vues plante. On teste ici le VRAI module, donc on
// le démasque explicitement (même procédé que `OrgChart.test.tsx`).
vi.unmock('@/lib/api')
vi.mock('@/lib/rate-limit-toast', () => ({ notifyIfRateLimited: vi.fn() }))
const loggedInCookie = vi.hoisted(() => ({ readable: true }))
vi.mock('@/features/auth/logged-in-cookie', () => ({ hasLoggedInCookie: () => loggedInCookie.readable }))

/**
 * `refreshTokensOnce` décide si l'utilisateur est déconnecté.
 *
 * Incident observé en prod : une analyse en cours, l'API renvoie un 429 (le
 * quota est global et l'écran de suivi le dépasse), et l'utilisateur se
 * retrouve sur `/login` — crédit débité, dossier perdu. La cause tient en une
 * ligne : le refresh traitait TOUT statut non-ok comme « session expirée ».
 *
 * Un 429 ou un 5xx dit « le serveur ne peut pas répondre maintenant ». Seul un
 * 401/403 dit « ces jetons ne valent plus rien ». Confondre les deux, c'est
 * déconnecter sur un hoquet réseau.
 */
function mockFetch(status: number | 'network-error') {
  const fn = vi.fn(async () => {
    if (status === 'network-error') throw new TypeError('Failed to fetch')
    return new Response(status === 204 ? null : '{}', { status })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/**
 * Chaque cas repart d'un module NEUF : `inflightRefresh` est un singleton de
 * module, et deux cas qui le partageraient se répondraient l'un l'autre.
 *
 * ⚠️ Coût réel : `resetModules()` + `import()` recompilent le graphe de `api.ts`
 * à chaque cas. Sur un runner chargé, les cinq cas de `it.each` ont dépassé les
 * 5 s par défaut de vitest (échec du 28/08 sur la CI, `setup 522 s` sur le
 * shard) — un budget d'horloge qui mesure la VITESSE DU RUNNER, pas le code.
 * Le budget est donc élargi ici, et nulle part ailleurs. Aucune assertion n'est
 * touchée : ce test-ci garde un incident de production (un 429 qui déconnectait
 * le commercial en pleine analyse, crédit débité et dossier perdu).
 */
const SLOW_REIMPORT_MS = 20_000

async function freshApi() {
  vi.resetModules()
  return import('./api')
}

describe('refreshTokensOnce — ne déconnecte que sur une session vraiment invalide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([401, 403])(
    'signale la session expirée sur %i',
    async status => {
      mockFetch(status)
      const api = await freshApi()
      const onExpired = vi.fn()
      api.setAuthExpiredHandler(onExpired)

      await expect(api.refreshTokensOnce()).resolves.toBe(false)
      expect(onExpired).toHaveBeenCalledTimes(1)
    },
    SLOW_REIMPORT_MS,
  )

  it.each([429, 500, 502, 503, 504])(
    'ne déconnecte PAS sur %i — le serveur est indisponible, pas la session',
    async status => {
      mockFetch(status)
      const api = await freshApi()
      const onExpired = vi.fn()
      api.setAuthExpiredHandler(onExpired)

      await expect(api.refreshTokensOnce()).resolves.toBe(false)
      expect(onExpired).not.toHaveBeenCalled()
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'ne déconnecte PAS sur une coupure réseau',
    async () => {
      mockFetch('network-error')
      const api = await freshApi()
      const onExpired = vi.fn()
      api.setAuthExpiredHandler(onExpired)

      await expect(api.refreshTokensOnce()).resolves.toBe(false)
      expect(onExpired).not.toHaveBeenCalled()
    },
    SLOW_REIMPORT_MS,
  )
})

/**
 * Session tenue 24 h (demande de Louis du 15/09/2026) — UN SEUL `/auth/refresh`
 * quand plusieurs onglets se réveillent ensemble.
 *
 * Le refresh token Supabase est à usage unique. Le verrou « single-flight »
 * vivait dans le MODULE : chaque onglet avait le sien. Deux onglets laissés
 * ouverts la nuit se réveillaient ensemble, envoyaient le même jeton, et le
 * second pouvait prendre `invalid_refresh_token` → retour à la connexion.
 * Chaque onglet est simulé ici par une instance NEUVE du module ; ce qu'ils
 * partagent est ce que partagent de vrais onglets : `navigator.locks`,
 * `localStorage`, et le bocal de cookies (le `fetch`).
 */
const USER_ID = '11111111-1111-4111-8111-111111111111'

function routeFetch(route: (url: string) => Response | Promise<Response>): string[] {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      return route(url)
    }),
  )
  return calls
}

function renewedBody(): string {
  return JSON.stringify({
    user: { id: USER_ID, email: 'sales@esn.fr', created_at: 'now', roles: ['customer'] },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })
}

/** Un `navigator.locks` minimal : une file par nom, comme le vrai gestionnaire. */
function installLockManager(): void {
  const tails = new Map<string, Promise<unknown>>()
  const request = (name: string, ...rest: unknown[]): Promise<unknown> => {
    const callback = rest[rest.length - 1] as (lock: unknown) => Promise<unknown>
    const run = (tails.get(name) ?? Promise.resolve()).then(() => callback({ name, mode: 'exclusive' }))
    tails.set(
      name,
      run.catch(() => undefined),
    )
    return run
  }
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
}

const refreshCalls = (calls: string[]) => calls.filter(url => url.endsWith('/auth/refresh'))

describe('refreshTokensOnce — plusieurs onglets, UN seul /auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    loggedInCookie.readable = true
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'locks')
  })

  it.each([
    ['avec navigator.locks', true],
    ['sans navigator.locks (repli par stockage)', false],
  ])(
    '%s → deux onglets qui se réveillent ensemble, un seul appel, tous deux renouvelés',
    async (_label, withLocks) => {
      if (withLocks) installLockManager()
      const calls = routeFetch(async url => {
        if (url.endsWith('/auth/refresh')) {
          await new Promise(resolve => setTimeout(resolve, 20))
          return new Response(renewedBody(), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      })
      const tabA = await freshApi()
      const tabB = await freshApi()

      await expect(Promise.all([tabA.refreshTokensOnce(), tabB.refreshTokensOnce()])).resolves.toEqual([true, true])
      expect(refreshCalls(calls)).toHaveLength(1)
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'un refus arrivé APRÈS qu’un autre onglet a renouvelé ne déconnecte pas',
    async () => {
      const api = await freshApi()
      const { recordRenewal } = await import('@/features/auth/cross-tab-refresh')
      routeFetch(url => {
        if (url.endsWith('/auth/refresh')) {
          // Un onglet d'une version antérieure, sans verrou, a tourné le jeton
          // pendant que le nôtre était en vol : notre jeton est « déjà utilisé ».
          recordRenewal(Math.floor(Date.now() / 1000) + 3600, USER_ID)
          return new Response('{}', { status: 401 })
        }
        return new Response('{}', { status: 200 })
      })
      const onExpired = vi.fn()
      api.setAuthExpiredHandler(onExpired)

      await expect(api.refreshTokensOnce()).resolves.toBe(true)
      expect(onExpired).not.toHaveBeenCalled()
    },
    SLOW_REIMPORT_MS,
  )
})

describe('apiFetch — un 401 ordinaire : un refresh, UNE relance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    loggedInCookie.readable = true
  })
  afterEach(() => vi.unstubAllGlobals())

  it(
    'sentinelle illisible mais onglet identifié → refresh puis relance unique',
    async () => {
      loggedInCookie.readable = false
      sessionStorage.setItem('bellum.tab.user', USER_ID)
      let accountCalls = 0
      const calls = routeFetch(url => {
        if (url.endsWith('/auth/refresh')) return new Response(renewedBody(), { status: 200 })
        accountCalls += 1
        return accountCalls === 1 ? new Response('{}', { status: 401 }) : new Response('{"ok":true}', { status: 200 })
      })
      const api = await freshApi()

      await expect(api.apiFetch({ path: '/accounts' })).resolves.toEqual({ ok: true })
      expect(refreshCalls(calls)).toHaveLength(1)
      expect(accountCalls).toBe(2)
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'toujours 401 après le refresh → l’erreur remonte, sans second refresh ni seconde relance',
    async () => {
      let accountCalls = 0
      const calls = routeFetch(url => {
        if (url.endsWith('/auth/refresh')) return new Response(renewedBody(), { status: 200 })
        accountCalls += 1
        return new Response('{}', { status: 401 })
      })
      const api = await freshApi()

      await expect(api.apiFetch({ path: '/accounts' })).rejects.toMatchObject({ status: 401 })
      expect(refreshCalls(calls)).toHaveLength(1)
      expect(accountCalls).toBe(2)
    },
    SLOW_REIMPORT_MS,
  )
})

/**
 * UN CORPS VIDE SUR UN 200 N'EST PAS UNE PANNE — #1608, #1640.3.
 *
 * Mesuré en production le 08/09/2026. `GET /accounts/:id/market-context` rend
 * `null` quand le compte n'est pas couvert par la mémoire marché — et NestJS
 * sérialise un `null` retourné par un contrôleur en **corps vide, statut 200**,
 * pas en `204`. `apiFetch` tombait donc dans `res.json()`, qui jette
 * `Unexpected end of JSON input`.
 *
 * Ce que ça donnait à l'écran : les deux cartes de mémoire marché du dossier de
 * compte écrivaient « Mémoire marché **indisponible** » — une PANNE — là où la
 * réponse honnête était « **Non mesuré** ». Sur les six comptes de l'espace de
 * démonstration, **deux** étaient dans ce cas.
 *
 * Le plus coûteux n'est pas le libellé : les deux composants portent une
 * branche `data === null → « Non mesuré »`, écrite exprès, testée, et
 * **inatteignable** — `null` n'arrivait jamais, il devenait une erreur en
 * chemin. C'est le défaut n°1 du dépôt (« du code juste que personne
 * n'appelle ») dans sa forme miroir : du code juste que rien ne peut atteindre.
 *
 * Le correctif vit dans `apiFetch` et nulle part ailleurs : c'est le seul
 * endroit qui décide comment un corps devient une valeur, et tout appelant qui
 * recevait cette exception était déjà cassé.
 */
describe('apiFetch — un corps vide sur un 200 n’est pas une panne', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  function mockBody(body: string | null, status = 200) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status })),
    )
  }

  it(
    'rend undefined au lieu de jeter, pour que l’appelant puisse dire « non mesuré »',
    async () => {
      mockBody('')
      const api = await freshApi()
      await expect(api.apiFetch({ path: '/accounts/x/market-context' })).resolves.toBeUndefined()
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'un 204 continue de rendre undefined',
    async () => {
      mockBody(null, 204)
      const api = await freshApi()
      await expect(api.apiFetch({ path: '/whatever' })).resolves.toBeUndefined()
    },
    SLOW_REIMPORT_MS,
  )

  /**
   * LE TÉMOIN — la garde ne doit pas attraper ce qu'elle ne vise pas.
   *
   * Un corps NON vide se parse toujours, et un JSON MAL FORMÉ doit toujours
   * jeter : sans ce cas, « ne plus jeter sur un corps vide » pourrait glisser
   * vers « ne plus jeter du tout », et une réponse tronquée par le réseau
   * passerait pour une absence de donnée.
   */
  it(
    'un corps non vide se parse, et un JSON mal formé jette toujours',
    async () => {
      mockBody('{"paths_observed":135}')
      const api = await freshApi()
      await expect(api.apiFetch({ path: '/ok' })).resolves.toEqual({ paths_observed: 135 })

      mockBody('{"tronque":')
      const api2 = await freshApi()
      await expect(api2.apiFetch({ path: '/casse' })).rejects.toThrow()
    },
    SLOW_REIMPORT_MS,
  )
})

/**
 * R15-7 (15/09/2026) — UN APPAREIL RÉVOQUÉ LE DIT.
 *
 * Constaté en production : l'onglet Chrome de Louis a été révoqué dès qu'il
 * s'est connecté sur son téléphone (plafond d'appareils atteint). L'API a bien
 * répondu « Session révoquée sur cet appareil », mais le client ne savait pas
 * la distinguer d'un jeton expiré : l'écran restait une coquille vide,
 * `/accounts` renvoyé vers `/chat` sans données, sans invitation à se
 * reconnecter.
 *
 * Une révocation est un verdict, pas un jeton périmé : aucun refresh ne la
 * lève. Le client la reconnaît à son CODE machine (`session_revoked`), jamais
 * à la phrase, et la signale pour que l'écran propose de se reconnecter.
 */
describe('apiFetch — une 401 `session_revoked` : aucun refresh, la révocation est signalée', () => {
  const revokedBody = () => JSON.stringify({ code: 'session_revoked', message: 'Session révoquée sur cet appareil.' })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    loggedInCookie.readable = true
  })
  afterEach(() => vi.unstubAllGlobals())

  it(
    'signale la révocation, n’appelle PAS /auth/refresh et remonte le code',
    async () => {
      let accountCalls = 0
      const calls = routeFetch(url => {
        if (url.endsWith('/auth/refresh')) return new Response(renewedBody(), { status: 200 })
        accountCalls += 1
        return new Response(revokedBody(), { status: 401 })
      })
      const api = await freshApi()
      const onExpired = vi.fn()
      api.setAuthExpiredHandler(onExpired)

      await expect(api.apiFetch({ path: '/accounts' })).rejects.toMatchObject({ status: 401, code: 'session_revoked' })
      expect(refreshCalls(calls)).toHaveLength(0)
      expect(accountCalls).toBe(1)
      expect(onExpired).toHaveBeenCalledWith('session_revoked')
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'un refresh refusé pour révocation le signale aussi comme révocation',
    async () => {
      routeFetch(url =>
        url.endsWith('/auth/refresh')
          ? new Response(revokedBody(), { status: 401 })
          : new Response('{}', { status: 200 }),
      )
      const api = await freshApi()
      const onExpired = vi.fn()
      api.setAuthExpiredHandler(onExpired)

      await expect(api.refreshTokensOnce()).resolves.toBe(false)
      expect(onExpired).toHaveBeenCalledWith('session_revoked')
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'NON — une 401 ordinaire garde son chemin : un refresh, une relance, jamais « révoqué »',
    async () => {
      let accountCalls = 0
      const calls = routeFetch(url => {
        if (url.endsWith('/auth/refresh')) return new Response(renewedBody(), { status: 200 })
        accountCalls += 1
        return accountCalls === 1 ? new Response('{}', { status: 401 }) : new Response('{"ok":true}', { status: 200 })
      })
      const api = await freshApi()
      const onExpired = vi.fn()
      api.setAuthExpiredHandler(onExpired)

      await expect(api.apiFetch({ path: '/accounts' })).resolves.toEqual({ ok: true })
      expect(refreshCalls(calls)).toHaveLength(1)
      expect(accountCalls).toBe(2)
      expect(onExpired).not.toHaveBeenCalled()
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'NON — un refresh refusé sans code signale une expiration ordinaire',
    async () => {
      mockFetch(401)
      const api = await freshApi()
      const onExpired = vi.fn()
      api.setAuthExpiredHandler(onExpired)

      await expect(api.refreshTokensOnce()).resolves.toBe(false)
      expect(onExpired).toHaveBeenCalledWith('expired')
    },
    SLOW_REIMPORT_MS,
  )
})

/**
 * #2519 / #2520 — une requête tombée pendant un redéploiement (502/503/504, ou
 * connexion coupée) se REJOUE, dans une borne, et seulement quand la rejouer ne
 * peut rien écrire deux fois. Le module de relance a ses propres témoins
 * (`transient-retry.test.ts`) ; ceux-ci prouvent qu'`apiFetch` l'emprunte, et
 * qu'il ne l'emprunte PAS pour une écriture.
 */
describe('apiFetch — relance bornée sur une panne de transport (#2519, #2520)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    loggedInCookie.readable = true
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it(
    'une lecture réussit à la 2e tentative après un 503',
    async () => {
      let calls = 0
      routeFetch(() => {
        calls += 1
        return calls === 1 ? new Response('{}', { status: 503 }) : new Response('{"ok":true}', { status: 200 })
      })
      const api = await freshApi()
      vi.useFakeTimers()
      const pending = api.apiFetch({ path: '/accounts' })
      await vi.runAllTimersAsync()
      await expect(pending).resolves.toEqual({ ok: true })
      expect(calls).toBe(2)
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'une lecture abandonne après la borne et rend l’erreur 502',
    async () => {
      let calls = 0
      routeFetch(() => {
        calls += 1
        return new Response('{}', { status: 502 })
      })
      const api = await freshApi()
      vi.useFakeTimers()
      const pending = api.apiFetch({ path: '/accounts' })
      const assertion = expect(pending).rejects.toMatchObject({ status: 502 })
      await vi.runAllTimersAsync()
      await assertion
      expect(calls).toBe(3)
    },
    SLOW_REIMPORT_MS,
  )

  it.each([502, 503, 504])(
    'NON — une écriture n’est JAMAIS rejouée sur un %i',
    async status => {
      let calls = 0
      routeFetch(() => {
        calls += 1
        return new Response('{}', { status })
      })
      const api = await freshApi()
      await expect(api.apiFetch({ path: '/accounts', method: 'POST', body: {} })).rejects.toMatchObject({ status })
      expect(calls).toBe(1)
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'NON — une écriture n’est JAMAIS rejouée sur une connexion coupée',
    async () => {
      const fetchMock = mockFetch('network-error')
      const api = await freshApi()
      await expect(api.apiFetch({ path: '/accounts', method: 'POST', body: {} })).rejects.toBeInstanceOf(TypeError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'un démarrage déclaré idempotent par son appelant se rejoue',
    async () => {
      let calls = 0
      routeFetch(() => {
        calls += 1
        return calls === 1 ? new Response('{}', { status: 503 }) : new Response('{"jobId":"j"}', { status: 200 })
      })
      const api = await freshApi()
      vi.useFakeTimers()
      const pending = api.apiFetch({ path: '/analysis/start', method: 'POST', body: {}, idempotent: true })
      await vi.runAllTimersAsync()
      await expect(pending).resolves.toEqual({ jobId: 'j' })
      expect(calls).toBe(2)
    },
    SLOW_REIMPORT_MS,
  )
})

/**
 * #3511 — la salle démo mettait dehors au bout de 3-4 min. Un onglet de
 * démonstration renouvelle par `/demo/session` : le serveur re-date le bail de SA
 * salle et rend une session neuve ; un onglet ordinaire garde `/auth/refresh`
 * (les règles de session de la production ne bougent pas).
 */
describe('refreshTokensOnce — onglet de démonstration (#3511)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it(
    'renouvelle par /demo/session, jamais par /auth/refresh',
    async () => {
      sessionStorage.setItem('bellum.tab.demo', '1')
      const fetchMock = mockFetch(200)
      const { refreshTokensOnce } = await freshApi()

      expect(await refreshTokensOnce()).toBe(true)

      const urls = fetchMock.mock.calls.map(call => String((call as unknown[])[0]))
      expect(urls.some(url => url.endsWith('/demo/session'))).toBe(true)
      expect(urls.some(url => url.endsWith('/auth/refresh'))).toBe(false)
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'garde /auth/refresh pour un onglet qui n’est pas en démo',
    async () => {
      const fetchMock = mockFetch(200)
      const { refreshTokensOnce } = await freshApi()

      expect(await refreshTokensOnce()).toBe(true)

      const urls = fetchMock.mock.calls.map(call => String((call as unknown[])[0]))
      expect(urls.some(url => url.endsWith('/auth/refresh'))).toBe(true)
      expect(urls.some(url => url.endsWith('/demo/session'))).toBe(false)
    },
    SLOW_REIMPORT_MS,
  )

  it(
    'la salle partie à un autre visiteur (401) reste une vraie expiration',
    async () => {
      sessionStorage.setItem('bellum.tab.demo', '1')
      mockFetch(401)
      const { refreshTokensOnce, setAuthExpiredHandler } = await freshApi()
      const onExpired = vi.fn()
      setAuthExpiredHandler(onExpired)

      expect(await refreshTokensOnce()).toBe(false)
      expect(onExpired).toHaveBeenCalledWith('expired')
    },
    SLOW_REIMPORT_MS,
  )
})
