import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Chaque test repart d'un module neuf : la sonde ne s'installe qu'une fois. */
async function freshModule() {
  vi.resetModules()
  return import('./networkBuffer')
}

function response(status: number, correlationId: string | null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name === 'x-correlation-id' ? correlationId : null) },
  } as unknown as Response
}

describe('networkBuffer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('retient l’identifiant de corrélation d’une réponse en échec', async () => {
    const { installNetworkProbe, getRecentNetworkFailures } = await freshModule()
    window.fetch = vi.fn().mockResolvedValue(response(500, 'corr-1')) as unknown as typeof fetch
    installNetworkProbe()

    await window.fetch('https://api.test/accounts')

    const [failure] = getRecentNetworkFailures()
    expect(failure).toMatchObject({ method: 'GET', status: 500, correlationId: 'corr-1', error: null })
    expect(typeof failure?.durationMs).toBe('number')
  })

  // Une issue est lue par plus de monde qu'une session : `?t=`, `code`, `state`
  // n'ont rien à y faire. Mais taire la PRÉSENCE d'une query cacherait parfois
  // la cause du bug, d'où le `?…`.
  it('retire la query en gardant la trace qu’il y en avait une', async () => {
    const { installNetworkProbe, getRecentNetworkFailures } = await freshModule()
    window.fetch = vi.fn().mockResolvedValue(response(403, null)) as unknown as typeof fetch
    installNetworkProbe()

    await window.fetch('https://api.test/demo/session?t=secret-token')

    expect(getRecentNetworkFailures()[0]?.url).toBe('https://api.test/demo/session?…')
    expect(getRecentNetworkFailures()[0]?.correlationId).toBeNull()
  })

  it('n’enregistre rien quand l’appel réussit, et rend la réponse telle quelle', async () => {
    const { installNetworkProbe, getRecentNetworkFailures } = await freshModule()
    const ok = response(200, 'corr-ok')
    window.fetch = vi.fn().mockResolvedValue(ok) as unknown as typeof fetch
    installNetworkProbe()

    await expect(window.fetch('https://api.test/health')).resolves.toBe(ok)
    expect(getRecentNetworkFailures()).toEqual([])
  })

  it('enregistre une coupure réseau puis relance l’erreur intacte', async () => {
    const { installNetworkProbe, getRecentNetworkFailures } = await freshModule()
    const boom = new Error('Failed to fetch')
    window.fetch = vi.fn().mockRejectedValue(boom) as unknown as typeof fetch
    const sink = vi.fn()
    installNetworkProbe(sink)

    await expect(window.fetch('https://api.test/accounts', { method: 'POST' })).rejects.toBe(boom)
    expect(getRecentNetworkFailures()[0]).toMatchObject({ method: 'POST', status: null, error: 'Failed to fetch' })
    expect(sink).toHaveBeenCalledWith('FAILED POST https://api.test/accounts — Failed to fetch')
  })

  it('#4622 — un appel annulé n’est pas une panne : rien n’est noté, l’erreur est relancée', async () => {
    const { installNetworkProbe, getRecentNetworkFailures } = await freshModule()
    const abort = Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' })
    window.fetch = vi.fn().mockRejectedValue(abort) as unknown as typeof fetch
    installNetworkProbe()

    await expect(window.fetch('https://api.test/context-contract?surface=search')).rejects.toBe(abort)
    expect(getRecentNetworkFailures()).toEqual([])
  })
})
