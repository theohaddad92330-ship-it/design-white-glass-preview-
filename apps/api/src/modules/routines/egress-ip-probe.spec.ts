import { Logger } from '@nestjs/common'
import {
  EgressIpProbe,
  judgeEgressIp,
  parseDeclaredEgressIps,
  readObservedEgressIp,
  type EgressIpAlert,
} from './egress-ip-probe'

const DECLARED = '208.77.244.241, 152.55.184.241,152.55.185.189'

describe('parseDeclaredEgressIps', () => {
  it('absente, vide ou blanche → null (no-op), jamais une liste devinée', () => {
    expect(parseDeclaredEgressIps(undefined)).toBeNull()
    expect(parseDeclaredEgressIps('')).toBeNull()
    expect(parseDeclaredEgressIps('  , ,')).toBeNull()
  })

  it('lit une liste séparée par des virgules, espaces tolérés', () => {
    expect(parseDeclaredEgressIps(DECLARED)).toEqual(['208.77.244.241', '152.55.184.241', '152.55.185.189'])
  })

  it('une entrée qui n’est pas une adresse IPv4 est écartée, pas corrigée', () => {
    expect(parseDeclaredEgressIps('208.77.244.241, pas-une-ip, 999.1.1.1')).toEqual(['208.77.244.241'])
    expect(parseDeclaredEgressIps('pas-une-ip')).toBeNull()
  })
})

describe('judgeEgressIp', () => {
  const declared = ['208.77.244.241', '152.55.184.241']
  it('dans la liste → ok', () => expect(judgeEgressIp('152.55.184.241', declared)).toBe('ok'))
  it('hors liste → changed', () => expect(judgeEgressIp('1.2.3.4', declared)).toBe('changed'))
  it('lecture impossible (null) → unknown, jamais changed', () => expect(judgeEgressIp(null, declared)).toBe('unknown'))
})

describe('readObservedEgressIp', () => {
  const answer = (body: string, ok = true): typeof fetch =>
    (async () => ({ ok, status: ok ? 200 : 503, text: async () => body })) as unknown as typeof fetch

  it('rend l’adresse lue, rognée', async () => {
    expect(await readObservedEgressIp(answer(' 152.55.184.241\n'), 'https://echo.test')).toBe('152.55.184.241')
  })
  it('statut non ok → null', async () => {
    expect(await readObservedEgressIp(answer('152.55.184.241', false), 'https://echo.test')).toBeNull()
  })
  it('corps qui n’est pas une adresse IPv4 → null (une page d’erreur n’est pas une IP)', async () => {
    expect(await readObservedEgressIp(answer('<html>Bad gateway</html>'), 'https://echo.test')).toBeNull()
  })
  it('réseau en échec ou délai dépassé → null, ne lève jamais', async () => {
    const boom = (async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch
    expect(await readObservedEgressIp(boom, 'https://echo.test')).toBeNull()
    const hang = ((_: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as unknown as typeof fetch
    expect(await readObservedEgressIp(hang, 'https://echo.test', 20)).toBeNull()
  })
})

describe('EgressIpProbe.run', () => {
  let alerts: { dispatch: jest.Mock }
  let fetchImpl: jest.Mock
  let errorSpy: jest.SpyInstance
  let logSpy: jest.SpyInstance
  const echo = (ip: string | null): void => {
    fetchImpl.mockImplementation(async () => {
      if (ip === null) throw new Error('unreachable')
      return { ok: true, status: 200, text: async () => ip }
    })
  }
  const probe = (declared: string | undefined): EgressIpProbe =>
    new EgressIpProbe({ declared, fetchImpl: fetchImpl as unknown as typeof fetch, alerts: alerts as EgressIpAlert })

  beforeEach(() => {
    alerts = { dispatch: jest.fn().mockResolvedValue(undefined) }
    fetchImpl = jest.fn()
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
  })
  afterEach(() => jest.restoreAllMocks())

  it('variable absente → no-op strict : aucun appel réseau, aucune alerte, aucun journal', async () => {
    expect(await probe(undefined).run()).toEqual({ verdict: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(alerts.dispatch).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('adresse dans la liste → rien : ni journal (même info) ni alerte levée', async () => {
    echo('152.55.184.241')
    expect(await probe(DECLARED).run()).toEqual({ verdict: 'ok' })
    expect(errorSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    // Seule la résolution d'une alerte éventuellement levée avant : l'alerte ne se lève pas.
    for (const [input] of alerts.dispatch.mock.calls) expect(input.resolved).toBe(true)
  })

  it('adresse hors liste → journal erreur ET alerte, avec l’adresse observée et la liste attendue', async () => {
    echo('9.9.9.9')
    expect(await probe(DECLARED).run()).toEqual({ verdict: 'changed', observed: '9.9.9.9' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const message = String(errorSpy.mock.calls[0]?.[0])
    expect(message).toContain('9.9.9.9')
    expect(message).toContain('208.77.244.241')
    expect(alerts.dispatch).toHaveBeenCalledTimes(1)
    const input = alerts.dispatch.mock.calls[0]?.[0]
    expect(input).toMatchObject({ kind: 'ip_sortante_changee', subject: 'egress-ip', resolved: false })
    expect(input.detail).toContain('9.9.9.9')
    expect(input.detail).toContain('152.55.185.189')
  })

  it('service d’écho injoignable → unknown : ni alerte, ni journal erreur, rien ne lève', async () => {
    echo(null)
    expect(await probe(DECLARED).run()).toEqual({ verdict: 'unknown' })
    expect(alerts.dispatch).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('une alerte qui échoue à partir ne fait pas tomber la sonde', async () => {
    echo('9.9.9.9')
    alerts.dispatch.mockRejectedValue(new Error('redis down'))
    await expect(probe(DECLARED).run()).resolves.toEqual({ verdict: 'changed', observed: '9.9.9.9' })
  })

  it('retour dans la liste → résout l’alerte précédente (sinon elle resterait « firing »)', async () => {
    echo('208.77.244.241')
    await probe(DECLARED).run()
    expect(alerts.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ip_sortante_changee', resolved: true }),
    )
  })

  it('sans canal d’alerte câblé, la sonde journalise quand même', async () => {
    echo('9.9.9.9')
    const bare = new EgressIpProbe({ declared: DECLARED, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(bare.run()).resolves.toEqual({ verdict: 'changed', observed: '9.9.9.9' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
