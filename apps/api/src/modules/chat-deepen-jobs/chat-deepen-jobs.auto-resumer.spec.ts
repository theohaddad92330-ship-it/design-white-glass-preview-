import type { ChatDeepenJobEntity } from '../../database/entities/chat-deepen-job.entity'
import {
  ChatDeepenJobsAutoResumer,
  MAX_AUTO_RESUMES,
  RESUME_SETTLE_MS,
  type DeepenResumePort,
} from './chat-deepen-jobs.auto-resumer'
import type { ChatDeepenJobsService } from './chat-deepen-jobs.service'

/**
 * #3236 (lot W2, décision Louis 11/10) — quand le budget d'une étude Approfondie est épuisé, le job
 * REPREND en fond, sans « continue », jusqu'au plafond de crédits de l'espace : jamais au-delà, et
 * l'arrêt est NOMMÉ.
 */
const job = (over: Partial<ChatDeepenJobEntity> = {}): ChatDeepenJobEntity =>
  ({
    id: 'job-1',
    user_id: 'user-1',
    conversation_id: 'conv-1',
    label: 'Étude du groupe Thales',
    status: 'queued',
    completed_steps: 2,
    current_step: null,
    auto_resumes: 0,
    stopped_reason: null,
    ...over,
  }) as ChatDeepenJobEntity

describe('ChatDeepenJobsAutoResumer', () => {
  let queue: ChatDeepenJobEntity[]
  let claim: jest.Mock
  let stop: jest.Mock
  let findQueuedBefore: jest.Mock
  let port: { creditsRemaining: jest.Mock; resume: jest.Mock }
  let resumer: ChatDeepenJobsAutoResumer

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T22:00:00.000Z'))
    queue = [job()]
    findQueuedBefore = jest.fn().mockImplementation(async () => queue.shift() ?? null)
    claim = jest.fn().mockResolvedValue(true)
    stop = jest.fn().mockResolvedValue(true)
    port = { creditsRemaining: jest.fn().mockResolvedValue(12), resume: jest.fn().mockResolvedValue(undefined) }
    const service = { findQueuedBefore, claimForAutoResume: claim, stop } as unknown as ChatDeepenJobsService
    resumer = new ChatDeepenJobsAutoResumer(service, port as DeepenResumePort)
  })

  afterEach(() => jest.useRealTimers())

  it('reprend une étude interrompue sans aucun message de la personne', async () => {
    await resumer.sweep()
    expect(findQueuedBefore).toHaveBeenCalledWith(new Date(Date.now() - RESUME_SETTLE_MS))
    expect(claim).toHaveBeenCalledWith('job-1')
    expect(port.resume).toHaveBeenCalledTimes(1)
    expect(port.resume.mock.calls[0][0]).toMatchObject({ id: 'job-1', user_id: 'user-1', conversation_id: 'conv-1' })
    expect(stop).not.toHaveBeenCalled()
  })

  it('s’arrête au plafond de crédits de l’espace, NOMMÉ, sans rien lancer', async () => {
    port.creditsRemaining.mockResolvedValue(0)
    await resumer.sweep()
    expect(stop).toHaveBeenCalledWith('job-1', 'credit_ceiling')
    expect(claim).not.toHaveBeenCalled()
    expect(port.resume).not.toHaveBeenCalled()
  })

  it('un solde non mesuré ne devient jamais « plafond atteint » ni une autorisation de dépasser : la reprise ne part pas', async () => {
    port.creditsRemaining.mockResolvedValue(null)
    await resumer.sweep()
    expect(port.resume).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalledWith('job-1', 'credit_ceiling')
  })

  it('borne le nombre de reprises automatiques et NOMME l’arrêt', async () => {
    queue = [job({ auto_resumes: MAX_AUTO_RESUMES })]
    await resumer.sweep()
    expect(stop).toHaveBeenCalledWith('job-1', 'max_resumes')
    expect(port.resume).not.toHaveBeenCalled()
  })

  it('ne reprend pas deux fois : une ligne déjà réclamée par une autre réplique est laissée', async () => {
    claim.mockResolvedValue(false)
    await resumer.sweep()
    expect(port.resume).not.toHaveBeenCalled()
  })

  it('une reprise qui lève s’arrête NOMMÉE resume_failed (jamais « failed », jamais relancée en boucle)', async () => {
    port.resume.mockRejectedValue(new Error('boom'))
    await resumer.sweep()
    expect(stop).toHaveBeenCalledWith('job-1', 'resume_failed')
  })

  it('sans port de reprise, rien ne part (no-op strict)', async () => {
    const bare = new ChatDeepenJobsAutoResumer(
      { findQueuedBefore, claimForAutoResume: claim, stop } as never,
      undefined,
    )
    await bare.sweep()
    expect(findQueuedBefore).not.toHaveBeenCalled()
  })

  it('ne relance pas un balayage déjà en vol (ré-entrance)', async () => {
    let release: () => void = () => {}
    port.resume.mockImplementationOnce(() => new Promise<void>(resolve => (release = resolve)))
    const first = resumer.tick()
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
    await resumer.tick()
    expect(findQueuedBefore).toHaveBeenCalledTimes(1)
    release()
    await first
  })
})
