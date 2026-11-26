import { composeWeeklyDigests, WeeklyDigestService } from './weekly-digest.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import { createMockRepository } from '../../database/test-utils'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande. `null` =
 *  aucune adresse déclarée par l'espace, donc repli sur l'environnement. */
/**
 * Le service de marque, réduit à ce que le code testé lui demande : la marque
 * du PRODUIT, c'est-à-dire un espace qui n'a rien posé — et `null` pour
 * l'adresse d'expédition, donc repli sur celle d'environnement.
 */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/** Fixed Monday-morning clock — every test windows against the same "now". */
const NOW = new Date('2026-07-13T08:00:00Z')

/** UTC `YYYY-MM-DD` n days before {@link NOW} — always inside/outside the
 *  7-day window deterministically. */
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

type RawRow = {
  id: string
  user_id: string
  workspace_id: string | null
  company_name: string
  priority_score: number | null
  recent_signals: unknown
}

function build() {
  const accounts = createMockRepository<AccountEntity>()
  const prefs = createMockRepository<NotificationPreferenceEntity>()
  // #2082.16 — depuis que l'absence de ligne ne vaut plus consentement, un test
  // qui veut vérifier la COMPOSITION doit dire explicitement que l'utilisateur
  // a coché. Les deux tests de la porte de consentement, eux, écrasent ce mock.
  prefs.findOne.mockResolvedValue({ user_id: 'u1', weekly_digest: true } as NotificationPreferenceEntity)
  const profiles = createMockRepository<ProfileEntity>()
  const notifications = {
    countSince: jest.fn().mockResolvedValue(0),
    createNotification: jest.fn().mockResolvedValue(undefined),
  }
  const mailer = { sendWeeklyDigestEmail: jest.fn().mockResolvedValue(undefined) }
  const suppression = { isSuppressed: jest.fn().mockResolvedValue(false) }
  const configValues: Record<string, string> = {
    frontendUrl: 'https://app.bellum.test',
    apiPublicUrl: 'https://api.bellum.test',
    internalApiSecret: 'secret-key',
  }
  const config = { get: jest.fn((key: string) => configValues[key]) }
  const service = new WeeklyDigestService(
    accounts as never,
    prefs as never,
    profiles as never,
    notifications as never,
    mailer as never,
    suppression as never,
    config as never,
    brandsStub as never,
  )
  const setRows = (rows: RawRow[]) => accounts._qb.getRawMany.mockResolvedValue(rows)
  return { service, accounts, prefs, profiles, notifications, mailer, suppression, config, setRows, configValues }
}

const row = (over: Partial<RawRow>): RawRow => ({
  id: 'acc-1',
  user_id: 'u1',
  workspace_id: 'w1',
  company_name: 'Doctolib',
  priority_score: 80,
  recent_signals: [],
  ...over,
})

describe('WeeklyDigestService — composition (real signals only, grouped by account)', () => {
  it('sends ONE email per user with the week’s dated signals grouped by account, highest score first', async () => {
    const { service, mailer, notifications, profiles, setRows } = build()
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr', first_name: 'Alex' } as ProfileEntity)
    setRows([
      row({
        id: 'acc-1',
        company_name: 'Doctolib',
        priority_score: 80,
        recent_signals: [
          { signal: 'Levée de fonds de 500 M€', date: daysAgo(2), source: 'Les Échos', type: 'funding' },
          // Duplicate (same label + source) — must be folded, never double-counted.
          { signal: 'Levée de fonds de 500 M€', date: daysAgo(2), source: 'Les Échos' },
          // Out of window (3 weeks old) — real but NOT « de la semaine ».
          { signal: 'Ancien signal', date: daysAgo(21), source: 'BODACC' },
          // Undated — can never be presented as a weekly signal.
          { signal: 'Signal sans date', source: 'Web' },
        ],
      }),
      row({
        id: 'acc-2',
        company_name: 'Veolia',
        priority_score: 60,
        recent_signals: [{ signal: 'Appel d’offres SI RH', date: daysAgo(4), source: 'BOAMP' }],
      }),
    ])

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 1, skipped: 0 })
    expect(mailer.sendWeeklyDigestEmail).toHaveBeenCalledTimes(1)
    const email = mailer.sendWeeklyDigestEmail.mock.calls[0][0]
    expect(email.to).toBe('rep@esn.fr')
    expect(email.firstName).toBe('Alex')
    expect(email.totalSignals).toBe(2)
    expect(email.totalAccounts).toBe(2)
    // Grouped by account, highest priority score first.
    expect(email.accounts.map((a: { companyName: string }) => a.companyName)).toEqual(['Doctolib', 'Veolia'])
    expect(email.accounts[0].signals).toEqual([
      { label: 'Levée de fonds de 500 M€', date: daysAgo(2), source: 'Les Échos' },
    ])
    expect(email.accounts[1].signals).toEqual([{ label: 'Appel d’offres SI RH', date: daysAgo(4), source: 'BOAMP' }])
    // Deep link to each dossier.
    expect(email.accounts[0].accountUrl).toBe('https://app.bellum.test/accounts/acc-1')
    expect(email.dashboardUrl).toBe('https://app.bellum.test/dashboard')
    expect(email.settingsUrl).toBe('https://app.bellum.test/settings/notifications')
    // Signed one-click unsubscribe through the EXISTING /emails/unsubscribe route.
    expect(email.unsubscribeUrl).toContain('https://api.bellum.test/emails/unsubscribe?token=')
    expect(email.oneClickUnsubscribe).toBe(true)

    // In-app mirror (= dedup marker) with the subject counts.
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    expect(notifications.createNotification).toHaveBeenCalledWith('u1', {
      type: 'weekly_digest',
      title: 'Votre veille de la semaine : 2 signaux sur 2 comptes',
      body: expect.stringContaining('Doctolib'),
      link: '/dashboard',
    })
  })

  it('caps the displayed signals per account and reports the overflow, while the subject keeps the real total', async () => {
    const { service, mailer, profiles, setRows } = build()
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)
    setRows([
      row({
        recent_signals: Array.from({ length: 7 }, (_, i) => ({
          signal: `Signal ${i + 1}`,
          date: daysAgo(1),
          source: `Source ${i + 1}`,
        })),
      }),
    ])

    await service.run(NOW)

    const email = mailer.sendWeeklyDigestEmail.mock.calls[0][0]
    expect(email.totalSignals).toBe(7)
    expect(email.accounts[0].signals).toHaveLength(5)
    expect(email.accounts[0].extraSignals).toBe(2)
  })

  it('respects the IA archive stamp even when the signal date is recent', async () => {
    const { service, mailer, notifications, setRows } = build()
    setRows([row({ recent_signals: [{ signal: 'Vieux signal re-daté', date: daysAgo(1), freshness: 'archive' }] })])

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 0, skipped: 0 })
    expect(notifications.createNotification).not.toHaveBeenCalled()
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
  })
})

describe('WeeklyDigestService — une date incomplète n’est pas « de la semaine » (#4832)', () => {
  it('écarte « 2026-07 » le 31 juillet : la fin du mois tombe dans la fenêtre, la date n’est pas au jour', async () => {
    const { service, mailer, setRows } = build()
    setRows([row({ recent_signals: [{ signal: 'Signal du mois', date: '2026-07', source: 'Presse' }] })])

    const result = await service.run(new Date('2026-07-31T08:00:00Z'))

    expect(result).toEqual({ sent: 0, skipped: 0 })
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
  })
})

describe('WeeklyDigestService — empty week = no email, ever', () => {
  it('sends NOTHING when followed accounts only carry stale or undated signals', async () => {
    const { service, mailer, notifications, prefs, setRows } = build()
    setRows([
      row({ recent_signals: [{ signal: 'Signal de mars', date: daysAgo(120), source: 'Presse' }] }),
      row({ id: 'acc-2', recent_signals: [{ signal: 'Sans date', source: 'Web' }] }),
    ])

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 0, skipped: 0 })
    expect(prefs.findOne).not.toHaveBeenCalled() // empty digests never reach the guards
    expect(notifications.createNotification).not.toHaveBeenCalled()
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
  })

  it('sends NOTHING when there are no followed accounts at all', async () => {
    const { service, mailer, setRows } = build()
    setRows([])

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 0, skipped: 0 })
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
  })
})

describe('WeeklyDigestService — opt-out (pref + suppression list #394)', () => {
  const weeklyRows = [row({ recent_signals: [{ signal: 'Levée de fonds', date: daysAgo(1), source: 'Les Échos' }] })]

  it('skips a user whose weekly_digest pref is OFF (no email, no in-app marker)', async () => {
    const { service, mailer, notifications, prefs, setRows } = build()
    prefs.findOne.mockResolvedValue({ user_id: 'u1', weekly_digest: false } as NotificationPreferenceEntity)
    setRows(weeklyRows)

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 0, skipped: 1 })
    expect(notifications.createNotification).not.toHaveBeenCalled()
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
  })

  // #2082.16 — REVIREMENT. Ce test affirmait l'inverse (« sends when the user
  // has NO pref row — défaut ON, politique zéro-flag ») : une boîte mail
  // recevait un e-mail hebdomadaire parce que son propriétaire n'avait jamais
  // ouvert l'écran de réglages. Une absence de choix n'est pas un choix.
  it('n’envoie RIEN à un utilisateur sans ligne de préférences (#2082.16 — pas de consentement présumé)', async () => {
    const { service, mailer, notifications, prefs, profiles, setRows } = build()
    prefs.findOne.mockResolvedValue(null)
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)
    setRows(weeklyRows)

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 0, skipped: 1 })
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
    expect(notifications.createNotification).not.toHaveBeenCalled()
  })

  it('envoie à un utilisateur qui a EXPLICITEMENT coché le digest', async () => {
    const { service, mailer, prefs, profiles, setRows } = build()
    prefs.findOne.mockResolvedValue({ user_id: 'u1', weekly_digest: true } as NotificationPreferenceEntity)
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)
    setRows(weeklyRows)

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 1, skipped: 0 })
    expect(mailer.sendWeeklyDigestEmail).toHaveBeenCalledTimes(1)
  })

  it('skips a suppressed address entirely (STRICT #394 opt-out — nothing is delivered)', async () => {
    const { service, mailer, notifications, profiles, suppression, setRows } = build()
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)
    suppression.isSuppressed.mockResolvedValue(true)
    setRows(weeklyRows)

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 0, skipped: 1 })
    expect(suppression.isSuppressed).toHaveBeenCalledWith('w1', 'rep@esn.fr')
    expect(notifications.createNotification).not.toHaveBeenCalled()
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
  })
})

describe('WeeklyDigestService — idempotence (one digest per user per week)', () => {
  const weeklyRows = [row({ recent_signals: [{ signal: 'Levée de fonds', date: daysAgo(1), source: 'Les Échos' }] })]

  it('skips a user who already received this week’s digest (cron replay)', async () => {
    const { service, mailer, notifications, setRows } = build()
    notifications.countSince.mockResolvedValue(1)
    setRows(weeklyRows)

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 0, skipped: 1 })
    expect(notifications.countSince).toHaveBeenCalledWith('u1', 'weekly_digest', expect.any(Date))
    expect(notifications.createNotification).not.toHaveBeenCalled()
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
  })

  it('stamps the dedup marker BEFORE handing the email to the mailer', async () => {
    const { service, mailer, notifications, profiles, setRows } = build()
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)
    setRows(weeklyRows)

    await service.run(NOW)

    const markerOrder = notifications.createNotification.mock.invocationCallOrder[0]
    const emailOrder = mailer.sendWeeklyDigestEmail.mock.invocationCallOrder[0]
    expect(markerOrder).toBeLessThan(emailOrder)
  })
})

describe('WeeklyDigestService — best-effort batch', () => {
  const twoUsersRows = [
    row({ id: 'acc-1', user_id: 'u1', recent_signals: [{ signal: 'S1', date: daysAgo(1), source: 'A' }] }),
    row({ id: 'acc-2', user_id: 'u2', recent_signals: [{ signal: 'S2', date: daysAgo(2), source: 'B' }] }),
  ]

  it('a failed send for one user never blocks the next user’s digest', async () => {
    const { service, mailer, profiles, setRows } = build()
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)
    mailer.sendWeeklyDigestEmail.mockRejectedValueOnce(new Error('smtp down'))
    setRows(twoUsersRows)

    // The in-app mirror was already delivered for BOTH users → both count sent.
    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 2, skipped: 0 })
    expect(mailer.sendWeeklyDigestEmail).toHaveBeenCalledTimes(2)
  })

  it('still delivers the in-app digest when no email is on file', async () => {
    const { service, mailer, notifications, profiles, setRows } = build()
    profiles.findOne.mockResolvedValue(null)
    setRows([twoUsersRows[0]])

    const result = await service.run(NOW)

    expect(result).toEqual({ sent: 1, skipped: 0 })
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    expect(mailer.sendWeeklyDigestEmail).not.toHaveBeenCalled()
  })

  it('falls back to the settings page (no one-click headers) when the unsubscribe token cannot be signed', async () => {
    const { service, mailer, profiles, configValues, setRows } = build()
    delete configValues['apiPublicUrl']
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)
    setRows([twoUsersRows[0]])

    await service.run(NOW)

    const email = mailer.sendWeeklyDigestEmail.mock.calls[0][0]
    expect(email.unsubscribeUrl).toBe('https://app.bellum.test/settings/notifications')
    expect(email.oneClickUnsubscribe).toBe(false)
  })
})

describe('composeWeeklyDigests (pure windowing/grouping rules)', () => {
  const nowMs = NOW.getTime()

  it('groups the week’s signals per user and drops users with an empty week', () => {
    const digests = composeWeeklyDigests(
      [
        row({ id: 'a1', user_id: 'u1', recent_signals: [{ signal: 'S1', date: daysAgo(3), source: 'X' }] }),
        row({ id: 'a2', user_id: 'u2', recent_signals: [{ signal: 'Vieux', date: daysAgo(60), source: 'X' }] }),
      ],
      nowMs,
    )
    expect(digests).toHaveLength(1)
    expect(digests[0]?.userId).toBe('u1')
    expect(digests[0]?.totalSignals).toBe(1)
  })

  it('sorts one account’s signals newest first', () => {
    const digests = composeWeeklyDigests(
      [
        row({
          recent_signals: [
            { signal: 'Plus vieux', date: daysAgo(6), source: 'X' },
            { signal: 'Plus récent', date: daysAgo(1), source: 'X' },
          ],
        }),
      ],
      nowMs,
    )
    expect(digests[0]?.accounts[0]?.signals.map(s => s.label)).toEqual(['Plus récent', 'Plus vieux'])
  })

  it('accepts a signal dated today and rejects one dated far in the future', () => {
    const future = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const digests = composeWeeklyDigests(
      [
        row({
          recent_signals: [
            { signal: 'Aujourd’hui', date: daysAgo(0), source: 'X' },
            { signal: 'Futur lointain', date: future, source: 'X' },
          ],
        }),
      ],
      nowMs,
    )
    expect(digests[0]?.accounts[0]?.signals.map(s => s.label)).toEqual(['Aujourd’hui'])
  })

  it('reads legacy label fields (title/label/description) like the Cockpit feed', () => {
    const digests = composeWeeklyDigests(
      [row({ recent_signals: [{ title: 'Titre legacy', date: daysAgo(2) }] })],
      nowMs,
    )
    expect(digests[0]?.accounts[0]?.signals[0]?.label).toBe('Titre legacy')
    expect(digests[0]?.accounts[0]?.signals[0]?.source).toBeNull()
  })

  it('uses the first non-null workspace across the user’s accounts for the unsubscribe scope', () => {
    const digests = composeWeeklyDigests(
      [
        row({ id: 'a1', workspace_id: null, recent_signals: [{ signal: 'S1', date: daysAgo(1) }] }),
        row({ id: 'a2', workspace_id: 'w9', recent_signals: [{ signal: 'S2', date: daysAgo(2) }] }),
      ],
      nowMs,
    )
    expect(digests[0]?.workspaceId).toBe('w9')
  })
})

// #4267.1 — le digest hebdomadaire ne lit que les comptes SUIVIS EXPLICITEMENT, et l'envoie à CELUI QUI SUIT.
describe('WeeklyDigestService — la population lue', () => {
  it('joint les suivis actifs, adresse le suiveur, ne lit plus le statut commercial', async () => {
    const { service, accounts, setRows } = build()
    setRows([])

    await service.run(NOW)

    expect(accounts._qb.innerJoin).toHaveBeenCalledWith(
      'account_follows',
      'follow',
      'follow.account_id = account.id AND follow.archived_at IS NULL',
    )
    expect(accounts._qb.select).toHaveBeenCalledWith(expect.arrayContaining(['follow.user_id AS user_id']))
    expect(JSON.stringify(accounts._qb.where.mock.calls.concat(accounts._qb.andWhere.mock.calls))).not.toContain(
      'commercial_status',
    )
  })
})
