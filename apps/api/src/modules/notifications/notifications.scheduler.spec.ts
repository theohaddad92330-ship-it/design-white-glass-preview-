import { NotificationsScheduler } from './notifications.scheduler'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/** Europe/Paris "today" — the same clock the scheduler uses. */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

describe('NotificationsScheduler — relance reminders', () => {
  let prefs: MockRepository<NotificationPreferenceEntity>
  let accounts: MockRepository<AccountEntity>
  let profiles: MockRepository<ProfileEntity>
  let planItems: MockRepository<ActionPlanItemEntity>
  let notifications: { createNotification: jest.Mock }
  let mailer: { sendNotificationEmail: jest.Mock }
  let weeklyDigest: { run: jest.Mock }
  let scheduler: NotificationsScheduler

  const today = parisToday()

  const openItem = (over: Partial<ActionPlanItemEntity>): ActionPlanItemEntity =>
    ({
      id: 'i-x',
      user_id: 'u1',
      account_id: 'acc-1',
      label: 'Relancer Marc',
      done: false,
      due_date: null,
      last_reminded_on: null,
      ...over,
    }) as ActionPlanItemEntity

  beforeEach(() => {
    prefs = createMockRepository<NotificationPreferenceEntity>()
    accounts = createMockRepository<AccountEntity>()
    profiles = createMockRepository<ProfileEntity>()
    planItems = createMockRepository<ActionPlanItemEntity>()
    notifications = { createNotification: jest.fn().mockResolvedValue(undefined) }
    mailer = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) }
    weeklyDigest = { run: jest.fn().mockResolvedValue({ sent: 0, skipped: 0 }) }
    scheduler = new NotificationsScheduler(
      prefs as never,
      accounts as never,
      profiles as never,
      planItems as never,
      notifications as never,
      mailer as never,
      weeklyDigest as never,
      { run: jest.fn().mockResolvedValue({ sent: 0, skipped: 0 }) } as never,
    )
  })

  describe('runRelanceReminders (pref gate)', () => {
    it('only queries opted-in users and does nothing when none opted in', async () => {
      prefs.find.mockResolvedValueOnce([])

      await scheduler.runRelanceReminders()

      expect(prefs.find).toHaveBeenCalledWith({ where: { relance_reminders: true } })
      expect(notifications.createNotification).not.toHaveBeenCalled()
      expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
    })

    it('processes each opted-in user', async () => {
      prefs.find.mockResolvedValueOnce([{ user_id: 'u1' }, { user_id: 'u2' }] as NotificationPreferenceEntity[])
      planItems.find.mockResolvedValue([]) // no overdue for anyone

      await scheduler.runRelanceReminders()

      expect(planItems.find).toHaveBeenCalledTimes(2)
    })
  })

  describe('sendRelanceRemindersForUser (overdue detection + dedup)', () => {
    it('notifies each overdue, not-yet-reminded item and stamps the dedup marker', async () => {
      planItems.find.mockResolvedValueOnce([
        openItem({ id: 'overdue', due_date: '2020-01-01', last_reminded_on: null }),
        openItem({ id: 'future', due_date: '2999-01-01' }),
        openItem({ id: 'reminded-today', due_date: '2020-01-01', last_reminded_on: today }),
      ])
      accounts.findOne.mockResolvedValue({ company_name: 'Doctolib' } as AccountEntity)
      profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)

      const count = await scheduler.sendRelanceRemindersForUser('u1')

      expect(count).toBe(1)
      // Only the genuinely-overdue, un-reminded item gets a notification.
      expect(notifications.createNotification).toHaveBeenCalledTimes(1)
      expect(notifications.createNotification).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ type: 'relance', link: '/accounts/acc-1' }),
      )
      const arg = notifications.createNotification.mock.calls[0][1] as { title: string }
      expect(arg.title).toContain('Doctolib')
      // Dedup marker stamped for that item only.
      expect(planItems.update).toHaveBeenCalledTimes(1)
      expect(planItems.update).toHaveBeenCalledWith({ id: 'overdue' }, { last_reminded_on: today })
      // Best-effort digest email delivered.
      expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1)
      expect(mailer.sendNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'rep@esn.fr' }))
    })

    it('returns 0 and notifies nothing when there are no overdue items', async () => {
      planItems.find.mockResolvedValueOnce([openItem({ id: 'future', due_date: '2999-01-01' })])

      const count = await scheduler.sendRelanceRemindersForUser('u1')

      expect(count).toBe(0)
      expect(notifications.createNotification).not.toHaveBeenCalled()
      expect(planItems.update).not.toHaveBeenCalled()
    })

    it('still delivers the in-app notification when no email is on file', async () => {
      planItems.find.mockResolvedValueOnce([openItem({ id: 'overdue', due_date: '2020-01-01' })])
      accounts.findOne.mockResolvedValue({ company_name: 'Doctolib' } as AccountEntity)
      profiles.findOne.mockResolvedValue(null)

      const count = await scheduler.sendRelanceRemindersForUser('u1')

      expect(count).toBe(1)
      expect(notifications.createNotification).toHaveBeenCalledTimes(1)
      expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
    })
  })
})

describe('NotificationsScheduler — action-overdue digest (transparence billing)', () => {
  let prefs: MockRepository<NotificationPreferenceEntity>
  let accounts: MockRepository<AccountEntity>
  let planItems: MockRepository<ActionPlanItemEntity>
  let notifications: { createNotification: jest.Mock; countSince: jest.Mock }
  let mailer: { sendNotificationEmail: jest.Mock }
  let scheduler: NotificationsScheduler

  const overdueItem = (over: Partial<ActionPlanItemEntity>): ActionPlanItemEntity =>
    ({
      id: 'i-x',
      user_id: 'u1',
      account_id: 'acc-1',
      label: 'Relancer Marc',
      done: false,
      due_date: '2020-01-01',
      last_reminded_on: null,
      ...over,
    }) as ActionPlanItemEntity

  beforeEach(() => {
    prefs = createMockRepository<NotificationPreferenceEntity>()
    accounts = createMockRepository<AccountEntity>()
    planItems = createMockRepository<ActionPlanItemEntity>()
    notifications = {
      createNotification: jest.fn().mockResolvedValue(undefined),
      countSince: jest.fn().mockResolvedValue(0),
    }
    mailer = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) }
    scheduler = new NotificationsScheduler(
      prefs as never,
      accounts as never,
      createMockRepository<ProfileEntity>() as never,
      planItems as never,
      notifications as never,
      mailer as never,
      { run: jest.fn() } as never,
      { run: jest.fn().mockResolvedValue({ sent: 0, skipped: 0 }) } as never,
    )
  })

  describe('runActionOverdueDigests (pref gate — opt-out, default ON)', () => {
    it('only queries opted-in users and does nothing when none opted in', async () => {
      prefs.find.mockResolvedValueOnce([])

      await scheduler.runActionOverdueDigests()

      expect(prefs.find).toHaveBeenCalledWith({ where: { action_overdue: true } })
      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('processes each opted-in user', async () => {
      prefs.find.mockResolvedValueOnce([{ user_id: 'u1' }, { user_id: 'u2' }] as NotificationPreferenceEntity[])
      planItems.find.mockResolvedValue([])

      await scheduler.runActionOverdueDigests()

      expect(planItems.find).toHaveBeenCalledTimes(2)
    })
  })

  describe('sendActionOverdueDigestForUser (digest + anti-spam)', () => {
    it('sends ONE digest naming the oldest overdue item, with no email', async () => {
      planItems.find.mockResolvedValueOnce([
        overdueItem({ id: 'newer', due_date: '2021-06-01', label: 'Envoyer la proposition' }),
        overdueItem({ id: 'oldest', due_date: '2020-01-01', label: 'Relancer Marc' }),
        overdueItem({ id: 'future', due_date: '2999-01-01' }),
      ])
      accounts.findOne.mockResolvedValue({ company_name: 'Doctolib' } as AccountEntity)

      const result = await scheduler.sendActionOverdueDigestForUser('u1')

      expect(result).toBe('sent')
      expect(notifications.createNotification).toHaveBeenCalledTimes(1)
      expect(notifications.createNotification).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ type: 'action_overdue', link: '/dashboard' }),
      )
      const arg = notifications.createNotification.mock.calls[0][1] as { title: string; body: string }
      // 2 overdue (the 2999 item is not) — title carries the count.
      expect(arg.title).toBe('2 actions en retard')
      // The OLDEST item is named; the rest is a "+N" tally.
      expect(arg.body).toContain('Relancer Marc')
      expect(arg.body).toContain('Doctolib')
      expect(arg.body).toContain('+1 autre')
      // Digest is in-app only — the relance reminders own the email path.
      expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
    })

    it('singularises the title for one overdue item', async () => {
      planItems.find.mockResolvedValueOnce([overdueItem({ id: 'only', due_date: '2020-01-01' })])
      accounts.findOne.mockResolvedValue({ company_name: 'Doctolib' } as AccountEntity)

      await scheduler.sendActionOverdueDigestForUser('u1')

      const arg = notifications.createNotification.mock.calls[0][1] as { title: string; body: string }
      expect(arg.title).toBe('1 action en retard')
      expect(arg.body).not.toContain('+')
    })

    it('skips when nothing is overdue (done or future items only)', async () => {
      planItems.find.mockResolvedValueOnce([
        overdueItem({ id: 'future', due_date: '2999-01-01' }),
        overdueItem({ id: 'undated', due_date: null }),
      ])

      const result = await scheduler.sendActionOverdueDigestForUser('u1')

      expect(result).toBe('skipped')
      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('anti-spam: skips when a digest already went out within the window (max 1/day)', async () => {
      notifications.countSince.mockResolvedValueOnce(1)

      const result = await scheduler.sendActionOverdueDigestForUser('u1')

      expect(result).toBe('skipped')
      expect(notifications.countSince).toHaveBeenCalledWith('u1', 'action_overdue', expect.any(Date))
      // Dedup short-circuits BEFORE any query work.
      expect(planItems.find).not.toHaveBeenCalled()
      expect(notifications.createNotification).not.toHaveBeenCalled()
    })
  })
})

describe('NotificationsScheduler — cron-tick singleton lock (multi-replica)', () => {
  const makeScheduler = (locks?: { withLock: jest.Mock }) => {
    const prefs = createMockRepository<NotificationPreferenceEntity>()
    prefs.find.mockResolvedValue([])
    const weeklyDigest = { run: jest.fn().mockResolvedValue({ sent: 0, skipped: 0 }) }
    const scheduler = new NotificationsScheduler(
      prefs as never,
      createMockRepository<AccountEntity>() as never,
      createMockRepository<ProfileEntity>() as never,
      createMockRepository<ActionPlanItemEntity>() as never,
      { createNotification: jest.fn() } as never,
      { sendNotificationEmail: jest.fn() } as never,
      weeklyDigest as never,
      { run: jest.fn().mockResolvedValue({ sent: 0, skipped: 0 }) } as never,
      locks as never,
    )
    return { scheduler, prefs, weeklyDigest }
  }

  it('runs the relance cron under the "relance-reminders" lock', async () => {
    const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
    const { scheduler, prefs } = makeScheduler(locks)

    await scheduler.runRelanceReminders()

    expect(locks.withLock).toHaveBeenCalledWith('relance-reminders', expect.any(Function))
    expect(prefs.find).toHaveBeenCalledTimes(1)
  })

  it('runs the weekly cron under the "weekly-summary" lock', async () => {
    const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
    const { scheduler, prefs } = makeScheduler(locks)

    await scheduler.runWeeklySummaries()

    expect(locks.withLock).toHaveBeenCalledWith('weekly-summary', expect.any(Function))
    expect(prefs.find).toHaveBeenCalledTimes(1)
  })

  it('runs the action-overdue cron under the "action-overdue" lock', async () => {
    const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
    const { scheduler, prefs } = makeScheduler(locks)

    await scheduler.runActionOverdueDigests()

    expect(locks.withLock).toHaveBeenCalledWith('action-overdue', expect.any(Function))
    expect(prefs.find).toHaveBeenCalledWith({ where: { action_overdue: true } })
  })

  it('runs the veille digest INSIDE the same weekly-summary tick lock', async () => {
    const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
    const { scheduler, weeklyDigest } = makeScheduler(locks)

    await scheduler.runWeeklySummaries()

    // Exactly one lock acquisition for the whole Monday tick — the digest does
    // not take (or need) a second lock of its own.
    expect(locks.withLock).toHaveBeenCalledTimes(1)
    expect(weeklyDigest.run).toHaveBeenCalledTimes(1)
  })

  it('a digest batch failure never breaks the weekly tick (summaries already sent)', async () => {
    const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
    const { scheduler, weeklyDigest } = makeScheduler(locks)
    weeklyDigest.run.mockRejectedValueOnce(new Error('smtp down'))

    await expect(scheduler.runWeeklySummaries()).resolves.toBeUndefined()
  })

  it('when another replica holds the tick lock, this replica does NOTHING (no duplicate emails)', async () => {
    const locks = { withLock: jest.fn().mockResolvedValue(false) } // lock denied: fn never invoked
    const { scheduler, prefs, weeklyDigest } = makeScheduler(locks)

    await scheduler.runRelanceReminders()
    await scheduler.runWeeklySummaries()

    expect(prefs.find).not.toHaveBeenCalled()
    expect(weeklyDigest.run).not.toHaveBeenCalled()
  })

  it('without a lock service wired (direct-`new`, dev) the crons run exactly as before', async () => {
    const { scheduler, prefs } = makeScheduler(undefined)

    await scheduler.runRelanceReminders()

    expect(prefs.find).toHaveBeenCalledWith({ where: { relance_reminders: true } })
  })
})

// #4648 — la purge hebdomadaire : son propre verrou de tick, un seuil à 7 jours, un journal qui COMPTE.
describe('NotificationsScheduler — purge hebdomadaire (#4648)', () => {
  const makeScheduler = (purgeOlderThan: jest.Mock, locks?: { withLock: jest.Mock }) =>
    new NotificationsScheduler(
      createMockRepository<NotificationPreferenceEntity>() as never,
      createMockRepository<AccountEntity>() as never,
      createMockRepository<ProfileEntity>() as never,
      createMockRepository<ActionPlanItemEntity>() as never,
      { purgeOlderThan } as never,
      { sendNotificationEmail: jest.fn() } as never,
      { run: jest.fn() } as never,
      { run: jest.fn() } as never,
      locks as never,
    )

  it('purge sous le verrou « notifications-weekly-purge », au seuil de 7 jours', async () => {
    const purge = jest.fn().mockResolvedValue({ deleted: 3, users: 2 })
    const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
    await makeScheduler(purge, locks).runWeeklyPurge()
    expect(locks.withLock).toHaveBeenCalledWith('notifications-weekly-purge', expect.any(Function))
    const age = Date.now() - (purge.mock.calls[0]?.[0] as Date).getTime()
    expect(age).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000)
    expect(age).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 60_000)
  })

  it('NON : une autre réplique tient le verrou ⇒ cette réplique ne purge rien', async () => {
    const purge = jest.fn()
    await makeScheduler(purge, { withLock: jest.fn().mockResolvedValue(false) }).runWeeklyPurge()
    expect(purge).not.toHaveBeenCalled()
  })

  it('un échec de purge ne casse pas le tick', async () => {
    const purge = jest.fn().mockRejectedValue(new Error('db down'))
    await expect(makeScheduler(purge).runWeeklyPurge()).resolves.toBeUndefined()
  })
})
