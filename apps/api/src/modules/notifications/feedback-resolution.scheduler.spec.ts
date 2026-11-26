import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FeedbackResolutionScheduler } from './feedback-resolution.scheduler'

// #2444.10 — L'APPELANT de `FeedbackService.notifyResolvedReports` : sans lui,
// le calcul reste juste et personne ne le déclenche jamais (le défaut n°1 de
// ce dépôt).
describe('FeedbackResolutionScheduler — l’APPELANT qui manquait', () => {
  it('appelle réellement le port, et crée une notification feedback_resolved par résolution', async () => {
    const created: { userId: string; input: Record<string, unknown> }[] = []
    const feedback = {
      notifyResolvedReports: jest.fn(async (notify: (userId: string, issueNumber: number) => Promise<void>) => {
        await notify('u1', 42)
        return 1
      }),
    }
    const notifications = {
      createNotification: jest.fn(async (userId: string, input: Record<string, unknown>) => {
        created.push({ userId, input })
      }),
    }
    const scheduler = new FeedbackResolutionScheduler(feedback as never, notifications as never)

    await scheduler.runFeedbackResolvedNotifications()

    expect(feedback.notifyResolvedReports).toHaveBeenCalledTimes(1)
    expect(created).toEqual([
      {
        userId: 'u1',
        input: expect.objectContaining({ type: 'feedback_resolved', origin: 'user_triggered' }),
      },
    ])
  })

  it('ne fait pas échouer le tick quand le port lève', async () => {
    const feedback = { notifyResolvedReports: jest.fn(async () => Promise.reject(new Error('github injoignable'))) }
    const notifications = { createNotification: jest.fn() }
    const scheduler = new FeedbackResolutionScheduler(feedback as never, notifications as never)
    await expect(scheduler.runFeedbackResolvedNotifications()).resolves.toBeUndefined()
  })

  it('passe par le verrou quand il est câblé', async () => {
    const feedback = { notifyResolvedReports: jest.fn(async () => 0) }
    const notifications = { createNotification: jest.fn() }
    const underLock = jest.fn(async (_name: string, run: () => Promise<void>) => run())
    const scheduler = new FeedbackResolutionScheduler(feedback as never, notifications as never, underLock)

    await scheduler.runFeedbackResolvedNotifications()

    expect(underLock).toHaveBeenCalledWith('feedback-resolved', expect.any(Function))
    expect(feedback.notifyResolvedReports).toHaveBeenCalledTimes(1)
  })

  it('lit un fichier réel qui porte bien un cron', () => {
    const source = readFileSync(join(__dirname, 'feedback-resolution.scheduler.ts'), 'utf8')
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain('@Cron(')
  })
})
