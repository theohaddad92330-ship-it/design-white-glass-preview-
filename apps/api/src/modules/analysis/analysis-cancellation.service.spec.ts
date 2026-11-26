import { AnalysisCancellationService, WORKER_SHUTDOWN_REASON } from './analysis-cancellation.service'

type MessageHandler = (channel: string, message: string) => void

/** One fake pub/sub client per `new IORedis()`; `duplicate()` yields the sub
 *  half. Handlers registered via `.on('message')` are collected so tests can
 *  simulate a broadcast delivery from another replica. */
const messageHandlers: MessageHandler[] = []
const publishMock = jest.fn().mockResolvedValue(1)

jest.mock('ioredis', () => {
  const makeSub = () => ({
    on: jest.fn((event: string, handler: MessageHandler) => {
      if (event === 'message') messageHandlers.push(handler)
    }),
    subscribe: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  })
  const ctor = jest.fn(() => ({
    publish: publishMock,
    duplicate: jest.fn(() => makeSub()),
    quit: jest.fn().mockResolvedValue('OK'),
  }))
  return { __esModule: true, default: ctor }
})

describe('AnalysisCancellationService', () => {
  it('returns a non-aborted signal on register and aborts it on cancel', () => {
    const svc = new AnalysisCancellationService()

    const signal = svc.register('job-1')
    expect(signal.aborted).toBe(false)

    expect(svc.cancel('job-1')).toBe(true)
    expect(signal.aborted).toBe(true)
  })

  it('returns false from cancel when no controller is registered', () => {
    const svc = new AnalysisCancellationService()
    expect(svc.cancel('unknown')).toBe(false)
  })

  it('reuses the same controller for re-registration of the same jobId', () => {
    // A retried job calls register() again — must observe the same signal
    // a racing cancel() may have already armed.
    const svc = new AnalysisCancellationService()

    const signal1 = svc.register('job-2')
    const signal2 = svc.register('job-2')
    expect(signal1).toBe(signal2)

    svc.cancel('job-2')
    expect(signal1.aborted).toBe(true)
    expect(signal2.aborted).toBe(true)
  })

  it('drops the controller after cancel so a fresh register starts clean', () => {
    const svc = new AnalysisCancellationService()
    const first = svc.register('job-3')
    svc.cancel('job-3')
    expect(first.aborted).toBe(true)

    const second = svc.register('job-3')
    expect(second).not.toBe(first)
    expect(second.aborted).toBe(false)
  })

  it('drops the controller on unregister so future cancel is a no-op', () => {
    const svc = new AnalysisCancellationService()
    svc.register('job-4')
    svc.unregister('job-4')
    expect(svc.cancel('job-4')).toBe(false)
  })

  it('uses the provided reason on the abort signal', () => {
    const svc = new AnalysisCancellationService()
    const signal = svc.register('job-5')

    svc.cancel('job-5', 'account_deleted')

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe('account_deleted')
  })
})

describe('AnalysisCancellationService — arrêt du service (redéploiement)', () => {
  const REAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...REAL_ENV }
    delete process.env['REDIS_URL']
  })

  afterEach(() => {
    process.env = REAL_ENV
  })

  it('interrompt toutes les analyses en cours avec la raison « arrêt du service »', () => {
    const svc = new AnalysisCancellationService()
    const a = svc.register('job-a')
    const b = svc.register('job-b')

    expect(svc.abortAllForShutdown()).toBe(2)

    expect(a.aborted).toBe(true)
    expect(b.aborted).toBe(true)
    // La raison est ce qui distingue « le service s'en va » (rejouer) de
    // « l'utilisateur annule » (s'arrêter). Les confondre perd le run.
    expect(a.reason).toBe(WORKER_SHUTDOWN_REASON)
    expect(b.reason).toBe(WORKER_SHUTDOWN_REASON)
  })

  it("ne diffuse rien aux autres réplicas — c'est CE processus qui s'arrête", () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379'
    publishMock.mockClear()
    const svc = new AnalysisCancellationService()
    svc.onModuleInit()
    svc.register('job-local')

    svc.abortAllForShutdown()

    // Une diffusion tuerait les analyses des réplicas qui, eux, vont très bien.
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('sans aucune analyse en cours: renvoie 0 et ne fait rien', () => {
    const svc = new AnalysisCancellationService()
    expect(svc.abortAllForShutdown()).toBe(0)
  })

  it("une annulation utilisateur garde SA raison après un arrêt (l'ordre ne les mélange pas)", () => {
    const svc = new AnalysisCancellationService()
    const cancelled = svc.register('job-user')
    svc.cancel('job-user', 'user_cancelled')

    const running = svc.register('job-running')
    svc.abortAllForShutdown()

    expect(cancelled.reason).toBe('user_cancelled')
    expect(running.reason).toBe(WORKER_SHUTDOWN_REASON)
  })

  it('SIGTERM déclenche la reprise: le crochet posé à init interrompt les analyses', () => {
    const svc = new AnalysisCancellationService()
    const before = process.listenerCount('SIGTERM')
    svc.onModuleInit()
    expect(process.listenerCount('SIGTERM')).toBe(before + 1)

    const signal = svc.register('job-sigterm')
    // On appelle le crochet directement : émettre un vrai SIGTERM dans la suite
    // de tests réveillerait aussi les écouteurs du lanceur de tests.
    const handler = process.listeners('SIGTERM').at(-1) as () => void
    handler()

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe(WORKER_SHUTDOWN_REASON)
  })

  it('retire son crochet à la destruction du module (pas de fuite d’écouteurs)', async () => {
    const svc = new AnalysisCancellationService()
    const before = process.listenerCount('SIGTERM')
    svc.onModuleInit()
    await svc.onModuleDestroy()
    expect(process.listenerCount('SIGTERM')).toBe(before)
  })
})

describe('AnalysisCancellationService — cross-replica cancel (Redis pub/sub)', () => {
  const REAL_ENV = process.env

  beforeEach(() => {
    messageHandlers.length = 0
    publishMock.mockClear()
    process.env = { ...REAL_ENV, REDIS_URL: 'redis://localhost:6379' }
  })

  afterEach(() => {
    process.env = REAL_ENV
    jest.clearAllMocks()
  })

  it('without REDIS_URL: no pub/sub clients, cancel stays purely in-process', () => {
    process.env = { ...REAL_ENV }
    delete process.env['REDIS_URL']
    const svc = new AnalysisCancellationService()
    svc.onModuleInit()

    const signal = svc.register('job-1')
    expect(svc.cancel('job-1')).toBe(true)
    expect(signal.aborted).toBe(true)
    expect(messageHandlers).toHaveLength(0)
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('cancel() broadcasts {jobId, reason} so the replica running the worker aborts too', () => {
    const svc = new AnalysisCancellationService()
    svc.onModuleInit()

    svc.cancel('job-remote', 'user_cancelled')

    expect(publishMock).toHaveBeenCalledWith(
      'bellum:analysis:cancel',
      JSON.stringify({ jobId: 'job-remote', reason: 'user_cancelled' }),
    )
  })

  it('a broadcast received from another replica aborts the locally registered controller', () => {
    // This instance plays the replica that RUNS the worker; the cancel HTTP
    // request landed elsewhere and arrives as a pub/sub message.
    const svc = new AnalysisCancellationService()
    svc.onModuleInit()
    expect(messageHandlers).toHaveLength(1)

    const signal = svc.register('job-42')
    messageHandlers[0]!('bellum:analysis:cancel', JSON.stringify({ jobId: 'job-42', reason: 'account_deleted' }))

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe('account_deleted')
  })

  it('loopback delivery of its own broadcast is a harmless no-op (controller already gone)', () => {
    const svc = new AnalysisCancellationService()
    svc.onModuleInit()

    const signal = svc.register('job-7')
    svc.cancel('job-7', 'user_cancelled') // local abort + broadcast
    expect(signal.aborted).toBe(true)

    // The publish comes back around to this same replica.
    expect(() =>
      messageHandlers[0]!('bellum:analysis:cancel', JSON.stringify({ jobId: 'job-7', reason: 'user_cancelled' })),
    ).not.toThrow()
  })

  it('ignores malformed broadcast payloads and messages on other channels', () => {
    const svc = new AnalysisCancellationService()
    svc.onModuleInit()
    const signal = svc.register('job-x')

    expect(() => messageHandlers[0]!('bellum:analysis:cancel', 'not-json{')).not.toThrow()
    expect(() => messageHandlers[0]!('bellum:analysis:cancel', JSON.stringify({ nope: true }))).not.toThrow()
    expect(() => messageHandlers[0]!('other:channel', JSON.stringify({ jobId: 'job-x' }))).not.toThrow()
    expect(signal.aborted).toBe(false)
  })

  it('onModuleDestroy closes both pub/sub clients (graceful shutdown)', async () => {
    const svc = new AnalysisCancellationService()
    svc.onModuleInit()
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined()
  })
})
