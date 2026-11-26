import { ConfigService } from '@nestjs/config'
import { BackofficeAlertDispatchService } from './backoffice-alert-dispatch.service'

/** Fausse fenêtre Redis en mémoire — juste GET/SET/SADD/SREM/SMEMBERS/QUIT. */
const store = new Map<string, string>()
const sets = new Map<string, Set<string>>()

jest.mock('ioredis', () => {
  const ctor = jest.fn(() => ({
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve('OK')
    }),
    sadd: jest.fn((key: string, member: string) => {
      const set = sets.get(key) ?? new Set<string>()
      set.add(member)
      sets.set(key, set)
      return Promise.resolve(1)
    }),
    srem: jest.fn((key: string, member: string) => {
      sets.get(key)?.delete(member)
      return Promise.resolve(1)
    }),
    smembers: jest.fn((key: string) => Promise.resolve([...(sets.get(key) ?? [])])),
    quit: jest.fn().mockResolvedValue('OK'),
  }))
  return { __esModule: true, default: ctor }
})

const resendSendMock = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: resendSendMock } })),
}))

const originalFetch = global.fetch

function makeConfig(): ConfigService {
  return {
    get: (key: string) =>
      key === 'resendApiKey' ? 're_test' : key === 'resendFrom' ? 'alerts@bellum.test' : undefined,
  } as unknown as ConfigService
}

describe('BackofficeAlertDispatchService — #1676.1', () => {
  const REAL_ENV = process.env

  beforeEach(() => {
    store.clear()
    sets.clear()
    resendSendMock.mockReset()
    resendSendMock.mockResolvedValue({ error: null })
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
    process.env = {
      ...REAL_ENV,
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'production',
      BACKOFFICE_ALERT_EMAILS: 'louis@bellum-it.com,theo@bellum-it.com',
    }
    delete process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL']
    delete process.env['BACKOFFICE_ALERTS_DISABLED']
  })

  afterEach(() => {
    process.env = REAL_ENV
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('⚠️⚠️ aucune alerte n’est envoyée depuis un environnement non-production', async () => {
    process.env['NODE_ENV'] = 'staging'
    const service = new BackofficeAlertDispatchService(makeConfig())

    const result = await service.dispatch({
      kind: 'connexion_anormale',
      subject: 'louis@x.com:pays_inhabituel',
      title: 'test',
      detail: 'détail',
      resolved: false,
    })

    expect(result).toEqual({ action: 'send', reason: 'non_production', channel: null })
    expect(resendSendMock).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('⚠️⚠️ TEST DE L’ISSUE : incident en staging → aucune alerte envoyée, même sans REDIS_URL', async () => {
    process.env['NODE_ENV'] = 'staging'
    delete process.env['REDIS_URL']
    const service = new BackofficeAlertDispatchService(makeConfig())

    await service.dispatch({
      kind: 'cout_quotidien',
      subject: 'global',
      title: 'Incident',
      detail: 'Un incident',
      resolved: false,
    })

    expect(resendSendMock).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('en production, une alerte email-only part par e-mail à chaque destinataire configuré', async () => {
    const service = new BackofficeAlertDispatchService(makeConfig())

    const result = await service.dispatch({
      kind: 'connexion_anormale',
      subject: 'louis@x.com:pays_inhabituel',
      title: 'Connexion depuis un pays inhabituel',
      detail: 'détail',
      resolved: false,
    })

    expect(result.action).toBe('send')
    expect(result.channel).toBe('email')
    expect(resendSendMock).toHaveBeenCalledTimes(2)
  })

  it('sans BACKOFFICE_ALERT_EMAILS, aucun envoi (no-op strict) mais le calcul continue', async () => {
    delete process.env['BACKOFFICE_ALERT_EMAILS']
    const service = new BackofficeAlertDispatchService(makeConfig())

    const result = await service.dispatch({
      kind: 'connexion_anormale',
      subject: 'x',
      title: 't',
      detail: 'd',
      resolved: false,
    })

    expect(result.action).toBe('send')
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  // #2528.3 — décision Louis 17/09 : provider_credits_exhausted ajoute les
  // owners de DM_ALLOWED_EMAILS, et EUX SEULS parmi les huit autres alertes.
  it('provider_credits_exhausted ajoute les owners de DM_ALLOWED_EMAILS aux destinataires', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'theo@x.com:owner,stagiaire@x.com:viewer'
    const service = new BackofficeAlertDispatchService(makeConfig())

    const result = await service.dispatch({
      kind: 'provider_credits_exhausted',
      subject: 'BRAVE_API_KEY',
      title: 'BRAVE_API_KEY',
      detail: 'Quota épuisé depuis 12:16 — la recherche web est dégradée pour tous les espaces.',
      resolved: false,
    })

    expect(result.action).toBe('send')
    expect(result.channel).toBe('email')
    // 2 BACKOFFICE_ALERT_EMAILS + 1 owner — jamais le viewer.
    expect(resendSendMock).toHaveBeenCalledTimes(3)
    const recipients = resendSendMock.mock.calls.map(call => call[0].to[0])
    expect(recipients).toEqual(['louis@bellum-it.com', 'theo@bellum-it.com', 'theo@x.com'])
  })

  it('une autre alerte (connexion_anormale) N’ajoute PAS les owners de DM_ALLOWED_EMAILS', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'theo@x.com:owner'
    const service = new BackofficeAlertDispatchService(makeConfig())

    await service.dispatch({
      kind: 'connexion_anormale',
      subject: 'louis@x.com:pays_inhabituel',
      title: 'test',
      detail: 'détail',
      resolved: false,
    })

    expect(resendSendMock).toHaveBeenCalledTimes(2) // BACKOFFICE_ALERT_EMAILS only
  })

  it('un déclenchement slack-preferred part sur Slack quand un webhook est configuré', async () => {
    process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL'] = 'https://hooks.slack.test/xyz'
    const service = new BackofficeAlertDispatchService(makeConfig())

    const result = await service.dispatch({
      kind: 'cout_quotidien',
      subject: 'global',
      title: 'Coût',
      detail: 'détail',
      resolved: false,
    })

    expect(result.channel).toBe('slack')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://hooks.slack.test/xyz',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  it('« sans webhook Slack configuré, tout part par e-mail. Jamais de perte. »', async () => {
    const service = new BackofficeAlertDispatchService(makeConfig())

    const result = await service.dispatch({
      kind: 'cout_quotidien',
      subject: 'global',
      title: 'Coût',
      detail: 'détail',
      resolved: false,
    })

    expect(result.channel).toBe('email')
    expect(resendSendMock).toHaveBeenCalled()
  })

  it('un échec Slack retombe sur l’e-mail — jamais de perte', async () => {
    process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL'] = 'https://hooks.slack.test/xyz'
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    const service = new BackofficeAlertDispatchService(makeConfig())

    await service.dispatch({ kind: 'cout_quotidien', subject: 'global', title: 't', detail: 'd', resolved: false })

    expect(resendSendMock).toHaveBeenCalled()
  })

  it('sait dire NON — un second déclenchement dans l’heure sur le même sujet est dédupliqué', async () => {
    const service = new BackofficeAlertDispatchService(makeConfig())
    const input = { kind: 'cout_quotidien' as const, subject: 'global', title: 't', detail: 'd', resolved: false }

    const first = await service.dispatch(input)
    const second = await service.dispatch(input)

    expect(first.action).toBe('send')
    expect(second).toEqual({ action: 'skip', reason: 'deduped', channel: null })
    expect(resendSendMock).toHaveBeenCalledTimes(2) // un envoi = 2 destinataires
  })

  it('n’attrape pas ce qu’elle ne vise pas — deux sujets distincts ne se dédupliquent pas entre eux', async () => {
    const service = new BackofficeAlertDispatchService(makeConfig())

    const a = await service.dispatch({
      kind: 'connexion_anormale',
      subject: 'a@x.com:pays',
      title: 't',
      detail: 'd',
      resolved: false,
    })
    const b = await service.dispatch({
      kind: 'connexion_anormale',
      subject: 'b@x.com:pays',
      title: 't',
      detail: 'd',
      resolved: false,
    })

    expect(a.action).toBe('send')
    expect(b.action).toBe('send')
  })

  it('une résolution envoie un message de résolution puis retire le sujet des sujets en défaut', async () => {
    const service = new BackofficeAlertDispatchService(makeConfig())
    const kind = 'connexion_anormale' as const

    await service.dispatch({ kind, subject: 'a@x.com:pays', title: 't', detail: 'd', resolved: false })
    expect(await service.listFiringSubjects(kind)).toEqual(['a@x.com:pays'])

    const resolution = await service.dispatch({
      kind,
      subject: 'a@x.com:pays',
      title: 't',
      detail: 'd',
      resolved: true,
    })

    expect(resolution.action).toBe('resolve')
    expect(await service.listFiringSubjects(kind)).toEqual([])
    expect(resendSendMock.mock.calls.at(-1)?.[0]?.subject).toContain('[RÉSOLU]')
  })

  it('l’interrupteur BACKOFFICE_ALERTS_DISABLED coupe l’envoi sans casser le calcul', async () => {
    process.env['BACKOFFICE_ALERTS_DISABLED'] = 'true'
    const service = new BackofficeAlertDispatchService(makeConfig())

    const result = await service.dispatch({
      kind: 'cout_quotidien',
      subject: 'global',
      title: 't',
      detail: 'd',
      resolved: false,
    })

    expect(result).toEqual({ action: 'send', reason: 'kill_switch_cut', channel: null })
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  /**
   * #1676.1 — `api_indisponible` et `job_bloque` passent par ce MÊME
   * dispatcheur (`killSwitchCut('backoffice.alerts_dispatch')` ne branche
   * jamais sur `kind`) : sans destinataire ni interrupteur coupé, zéro appel
   * réseau — ni Resend, ni `fetch` (Slack). No-op STRICT.
   */
  it.each(['api_indisponible', 'job_bloque'] as const)(
    '⚠️ %s — l’interrupteur coupé : ZÉRO appel réseau (ni e-mail, ni Slack)',
    async kind => {
      process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL'] = 'https://hooks.slack.test/x' // même slack-preferred
      process.env['BACKOFFICE_ALERTS_DISABLED'] = 'true'
      const service = new BackofficeAlertDispatchService(makeConfig())

      const result = await service.dispatch({
        kind,
        subject: kind === 'api_indisponible' ? 'database' : 'analysis_worker',
        title: 't',
        detail: 'd',
        resolved: false,
      })

      expect(result.channel).toBeNull()
      expect(resendSendMock).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    },
  )
})
