import * as Sentry from '@sentry/nestjs'
import { SentryWinstonTransport } from './sentry-winston.transport'

jest.mock('@sentry/nestjs', () => ({
  withScope: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}))

const captureException = Sentry.captureException as jest.Mock
const captureMessage = Sentry.captureMessage as jest.Mock

interface FakeScope {
  setTag: jest.Mock
  setUser: jest.Mock
  setContext: jest.Mock
  setExtra: jest.Mock
  setFingerprint: jest.Mock
}

let scope: FakeScope

function send(info: Record<string, unknown>): void {
  const transport = new SentryWinstonTransport()
  transport.log(info, () => undefined)
}

function fingerprint(): string[] {
  return scope.setFingerprint.mock.calls.at(-1)?.[0] as string[]
}

describe('SentryWinstonTransport', () => {
  beforeEach(() => {
    process.env['SENTRY_DSN'] = 'https://example@sentry.invalid/1'
    jest.clearAllMocks()
    scope = {
      setTag: jest.fn(),
      setUser: jest.fn(),
      setContext: jest.fn(),
      setExtra: jest.fn(),
      setFingerprint: jest.fn(),
    }
    ;(Sentry.withScope as jest.Mock).mockImplementation((cb: (s: FakeScope) => void) => cb(scope))
  })

  afterEach(() => {
    delete process.env['SENTRY_DSN']
  })

  it('deux messages différents → deux empreintes différentes', () => {
    send({ level: 'error', message: 'Alertes aveugles', context: 'Obs' })
    const a = fingerprint()
    send({ level: 'error', message: 'Fuite détectée', context: 'Obs' })
    expect(fingerprint()).not.toEqual(a)
    expect(a[0]).toBe('winston')
    expect(a[1]).toBe('Obs')
  })

  it("deux messages qui ne diffèrent que par l'ID, le client ou le détail → la même empreinte", () => {
    send({
      level: 'error',
      message: 'Contrat sur facture à traiter — Tech4KIN : invoice_missing(2026-09-01, J+12)',
    })
    const a = fingerprint()
    send({ level: 'error', message: 'Contrat sur facture à traiter — Keyrus : invoice_missing(2026-10-01, J+3)' })
    expect(fingerprint()).toEqual(a)
    send({
      level: 'error',
      message: 'Import 3f2b8c1e-1111-4222-8333-abcdefabcdef pour a@b.fr le 2026-10-20 : 42 lignes',
    })
    const c = fingerprint()
    send({
      level: 'error',
      message: 'Import 9a2b8c1e-2222-4222-8333-abcdefabcdef pour z@y.io le 2025-01-02 : 7 lignes',
    })
    expect(fingerprint()).toEqual(c)
  })

  it('stack en tableau → extra.stack est une chaîne lisible', () => {
    send({ level: 'error', message: 'Boom', stack: ['Error: boom', '    at a (x.ts:1:1)'] })
    expect(scope.setExtra).toHaveBeenCalledWith('stack', 'Error: boom\n    at a (x.ts:1:1)')
    expect(captureException).toHaveBeenCalledTimes(1)
    const [err] = captureException.mock.calls[0] as [Error]
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Boom')
  })

  it('stack en chaîne → extra.stack identique', () => {
    send({ level: 'error', message: 'Boom', stack: 'Error: boom\n    at a' })
    expect(scope.setExtra).toHaveBeenCalledWith('stack', 'Error: boom\n    at a')
  })

  it('capture la vraie Error trouvée dans les métadonnées', () => {
    const real = new Error('vraie cause')
    send({ level: 'error', message: 'Échec', err: real })
    expect(captureException.mock.calls[0][0]).toBe(real)
    send({ level: 'error', message: 'Échec', cause: real })
    expect(captureException.mock.calls[1][0]).toBe(real)
    send({ level: 'error', message: 'Échec', stack: [real] })
    expect(captureException.mock.calls[2][0]).toBe(real)
  })

  it('sans pile ni erreur → captureMessage avec empreinte', () => {
    send({ level: 'error', message: 'Simple' })
    expect(captureMessage).toHaveBeenCalledWith('Simple', 'error')
    expect(scope.setFingerprint).toHaveBeenCalled()
  })

  it('silencieux sans SENTRY_DSN', () => {
    delete process.env['SENTRY_DSN']
    send({ level: 'error', message: 'x' })
    expect(Sentry.withScope).not.toHaveBeenCalled()
  })
})
