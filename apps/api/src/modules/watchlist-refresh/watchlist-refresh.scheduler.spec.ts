import type { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { activeFollowExists } from '../account-follows/account-follow.entity'
import { WatchlistRefreshScheduler } from './watchlist-refresh.scheduler'
import {
  REGISTRY_WATCH_JOB,
  WATCHLIST_REFRESH_MIN_SPACING_MS,
  WATCHLIST_REFRESH_WINDOW_MS,
  maxSignalAlertsPerDay,
  parseWatchlistRefreshCap,
  registryWatchJobId,
  selectDailyBatch,
  watchlistRefreshJobId,
  type WatchlistCandidateRow,
} from './watchlist-refresh.queue'

/** Europe/Paris "today" — same clock the scheduler stamps into jobIds. */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

function row(over: Partial<WatchlistCandidateRow> = {}): WatchlistCandidateRow {
  return { id: 'acc-1', user_id: 'u1', workspace_id: 'ws-1', ...over }
}

describe('WatchlistRefreshScheduler', () => {
  let accounts: MockRepository<AccountEntity>
  let queue: { add: jest.Mock }
  let scheduler: WatchlistRefreshScheduler

  beforeEach(() => {
    accounts = createMockRepository<AccountEntity>()
    queue = { add: jest.fn().mockResolvedValue(undefined) }
    scheduler = new WatchlistRefreshScheduler(accounts as never, queue as never)
    delete process.env['WATCHLIST_REFRESH_DISABLED']
    delete process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE']
    delete process.env['WATCHLIST_REFRESH_SPACING_MS']
  })

  afterEach(() => {
    delete process.env['WATCHLIST_REFRESH_DISABLED']
    delete process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE']
    delete process.env['WATCHLIST_REFRESH_SPACING_MS']
  })

  describe('selection (watchlist = comptes suivis, dossier complet)', () => {
    it('queries only followed commercial statuses with a completed analysis', async () => {
      accounts._qb.getRawMany.mockResolvedValueOnce([])

      await scheduler.enqueueDailyBatch()

      // #4267.1 — un compte n'est rafraîchi que s'il est SUIVI EXPLICITEMENT ; un statut commercial « suivi »
      // sans suivi explicite ne coûte plus rien (le prédicat ne lit plus le statut commercial).
      expect(accounts._qb.where).toHaveBeenCalledWith(activeFollowExists('account'))
      expect(JSON.stringify(accounts._qb.where.mock.calls.concat(accounts._qb.andWhere.mock.calls))).not.toContain(
        'commercial_status',
      )
      expect(accounts._qb.andWhere).toHaveBeenCalledWith('account.status = :completed', { completed: 'completed' })
      // BELLUM-API-7 — les espaces de démo sont figés (l'IA les refuse) : jamais mis en file.
      expect(JSON.stringify(accounts._qb.andWhere.mock.calls)).toContain('workspaces')
      expect(JSON.stringify(accounts._qb.andWhere.mock.calls)).toContain('is_demo')
      // Stalest dossier first — the daily cap then rotates through the watchlist.
      expect(accounts._qb.orderBy).toHaveBeenCalledWith('account.updated_at', 'ASC')
    })

    it('enqueues one job per selected account', async () => {
      accounts._qb.getRawMany.mockResolvedValueOnce([row({ id: 'a1' }), row({ id: 'a2', user_id: 'u2' })])

      const enqueued = await scheduler.enqueueDailyBatch()

      expect(enqueued).toBe(2)
      expect(queue.add).toHaveBeenCalledTimes(2)
      expect(queue.add).toHaveBeenCalledWith(
        'refresh',
        { accountId: 'a1', userId: 'u1' },
        expect.objectContaining({ jobId: watchlistRefreshJobId('a1', parisToday()) }),
      )
    })

    it('enqueues nothing when the watchlist is empty', async () => {
      accounts._qb.getRawMany.mockResolvedValueOnce([])

      const enqueued = await scheduler.enqueueDailyBatch()

      expect(enqueued).toBe(0)
      expect(queue.add).not.toHaveBeenCalled()
    })
  })

  describe('volume cap (refresh système non débité → borne stricte)', () => {
    // ⚠️ RENVERSEMENT DATÉ — #4016 L7, décision Louis 11/10/2026 : « veille de
    // tout le portefeuille suivi, chaque jour ». Jusqu'au 11/10, ce test disait
    // « caps at 10 accounts per workspace per day by default ».
    it('refreshes the WHOLE followed portfolio every day by default (no cap posed)', async () => {
      const rows = Array.from({ length: 140 }, (_, i) => row({ id: `a${i}` }))
      accounts._qb.getRawMany.mockResolvedValueOnce(rows)

      const enqueued = await scheduler.enqueueDailyBatch()

      expect(enqueued).toBe(140)
      expect(queue.add).toHaveBeenCalledTimes(140)
    })

    it('honours WATCHLIST_REFRESH_MAX_PER_WORKSPACE', async () => {
      process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = '2'
      accounts._qb.getRawMany.mockResolvedValueOnce([row({ id: 'a1' }), row({ id: 'a2' }), row({ id: 'a3' })])

      const enqueued = await scheduler.enqueueDailyBatch()

      expect(enqueued).toBe(2)
    })

    it('applies the cap per workspace, not globally', async () => {
      process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = '1'
      accounts._qb.getRawMany.mockResolvedValueOnce([
        row({ id: 'a1', workspace_id: 'ws-1' }),
        row({ id: 'a2', workspace_id: 'ws-1' }),
        row({ id: 'b1', workspace_id: 'ws-2' }),
      ])

      const enqueued = await scheduler.enqueueDailyBatch()

      expect(enqueued).toBe(2)
      const ids = queue.add.mock.calls.map(call => (call[1] as { accountId: string }).accountId)
      expect(ids).toEqual(expect.arrayContaining(['a1', 'b1']))
    })

    // #4016 L7 — « garde un plafond opérateur optionnel par plan » : le MÊME
    // réglage accepte `palier=N` (un réglage vit à un seul endroit, GA-26).
    describe('plafond opérateur PAR PLAN (optionnel)', () => {
      function withPlans(plans: Record<string, string | null>) {
        const planFeatures = {
          planForWorkspace: jest.fn(async (workspaceId: string) => plans[workspaceId] ?? null),
        }
        scheduler = new WatchlistRefreshScheduler(accounts as never, queue as never, undefined, planFeatures as never)
        return planFeatures
      }

      it('borne le palier nommé, laisse les autres paliers suivre tout leur portefeuille', async () => {
        process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = 'growth=1'
        withPlans({ 'ws-1': 'growth', 'ws-2': 'team' })
        accounts._qb.getRawMany.mockResolvedValueOnce([
          row({ id: 'a1', workspace_id: 'ws-1' }),
          row({ id: 'a2', workspace_id: 'ws-1' }),
          row({ id: 'b1', workspace_id: 'ws-2' }),
          row({ id: 'b2', workspace_id: 'ws-2' }),
          row({ id: 'b3', workspace_id: 'ws-2' }),
        ])

        const enqueued = await scheduler.enqueueDailyBatch()

        expect(enqueued).toBe(4)
        const ids = queue.add.mock.calls.map(call => (call[1] as { accountId: string }).accountId)
        expect(ids).toEqual(expect.arrayContaining(['a1', 'b1', 'b2', 'b3']))
        expect(ids).not.toContain('a2')
      })

      it('`*=N` borne les paliers non nommés ; un palier nommé l’emporte', async () => {
        process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = '*=1,team=3'
        withPlans({ 'ws-1': 'growth', 'ws-2': 'team' })
        accounts._qb.getRawMany.mockResolvedValueOnce([
          row({ id: 'a1', workspace_id: 'ws-1' }),
          row({ id: 'a2', workspace_id: 'ws-1' }),
          row({ id: 'b1', workspace_id: 'ws-2' }),
          row({ id: 'b2', workspace_id: 'ws-2' }),
          row({ id: 'b3', workspace_id: 'ws-2' }),
        ])

        expect(await scheduler.enqueueDailyBatch()).toBe(4)
      })

      it('un palier à 0 coupe la veille de CE palier seulement', async () => {
        process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = 'growth=0'
        withPlans({ 'ws-1': 'growth', 'ws-2': 'team' })
        accounts._qb.getRawMany.mockResolvedValueOnce([
          row({ id: 'a1', workspace_id: 'ws-1' }),
          row({ id: 'b1', workspace_id: 'ws-2' }),
        ])

        expect(await scheduler.enqueueDailyBatch()).toBe(1)
        expect((queue.add.mock.calls[0][1] as { accountId: string }).accountId).toBe('b1')
      })

      it('sans plafond par plan, aucun palier n’est lu (zéro requête de plus)', async () => {
        const planFeatures = withPlans({ 'ws-1': 'growth' })
        accounts._qb.getRawMany.mockResolvedValueOnce([row({ id: 'a1' })])

        await scheduler.enqueueDailyBatch()

        expect(planFeatures.planForWorkspace).not.toHaveBeenCalled()
      })

      it('palier illisible : le plafond `*` s’il existe, sinon tout le portefeuille', async () => {
        process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = '*=1,growth=5'
        const planFeatures = withPlans({})
        planFeatures.planForWorkspace.mockRejectedValueOnce(new Error('db down'))
        accounts._qb.getRawMany.mockResolvedValueOnce([
          row({ id: 'a1', workspace_id: 'ws-1' }),
          row({ id: 'a2', workspace_id: 'ws-1' }),
        ])

        expect(await scheduler.enqueueDailyBatch()).toBe(1)
      })
    })
  })

  describe('étalement (pas de tempête au tick)', () => {
    // #4016 L7 — tout le portefeuille, chaque jour : l'étalement se RESSERRE
    // pour que le lot tienne dans la journée, sans jamais descendre sous un
    // plancher qui martèlerait les sources.
    it('resserre l’espacement pour que tout le portefeuille tienne dans la fenêtre du jour', async () => {
      const rows = Array.from({ length: 600 }, (_, i) => row({ id: `a${i}` }))
      accounts._qb.getRawMany.mockResolvedValueOnce(rows)

      await scheduler.enqueueDailyBatch()

      const delays = queue.add.mock.calls.map(call => (call[2] as { delay: number }).delay)
      const step = delays[1] - delays[0]
      expect(step).toBeLessThan(300_000)
      expect(step).toBeGreaterThanOrEqual(WATCHLIST_REFRESH_MIN_SPACING_MS)
      expect(delays[delays.length - 1]).toBeLessThanOrEqual(WATCHLIST_REFRESH_WINDOW_MS)
    })

    it('ne descend JAMAIS sous le plancher, même si le lot déborde la fenêtre', async () => {
      const rows = Array.from({ length: 5000 }, (_, i) => row({ id: `a${i}` }))
      accounts._qb.getRawMany.mockResolvedValueOnce(rows)

      await scheduler.enqueueDailyBatch()

      const delays = queue.add.mock.calls.map(call => (call[2] as { delay: number }).delay)
      expect(delays[1] - delays[0]).toBe(WATCHLIST_REFRESH_MIN_SPACING_MS)
    })

    it('staggers jobs with an increasing delay (default 5 min spacing)', async () => {
      accounts._qb.getRawMany.mockResolvedValueOnce([row({ id: 'a1' }), row({ id: 'a2' }), row({ id: 'a3' })])

      await scheduler.enqueueDailyBatch()

      const delays = queue.add.mock.calls.map(call => (call[2] as { delay: number }).delay)
      expect(delays).toEqual([0, 300_000, 600_000])
    })

    it('honours WATCHLIST_REFRESH_SPACING_MS', async () => {
      process.env['WATCHLIST_REFRESH_SPACING_MS'] = '1000'
      accounts._qb.getRawMany.mockResolvedValueOnce([row({ id: 'a1' }), row({ id: 'a2' })])

      await scheduler.enqueueDailyBatch()

      const delays = queue.add.mock.calls.map(call => (call[2] as { delay: number }).delay)
      expect(delays).toEqual([0, 1000])
    })
  })

  describe('idempotence multi-replica', () => {
    it('runs the cron body under the watchlist-refresh singleton lock', async () => {
      const locks = {
        withLock: jest.fn(async (_name: string, fn: () => Promise<void>) => {
          await fn()
          return true
        }),
      }
      scheduler = new WatchlistRefreshScheduler(accounts as never, queue as never, locks as never)
      accounts._qb.getRawMany.mockResolvedValueOnce([row()])

      await scheduler.runDailyWatchlistRefresh()

      expect(locks.withLock).toHaveBeenCalledWith('watchlist-refresh', expect.any(Function))
      expect(queue.add).toHaveBeenCalledTimes(1)
    })

    it('enqueues nothing when another replica holds the tick lock', async () => {
      const locks = { withLock: jest.fn().mockResolvedValue(false) }
      scheduler = new WatchlistRefreshScheduler(accounts as never, queue as never, locks as never)

      await scheduler.runDailyWatchlistRefresh()

      expect(queue.add).not.toHaveBeenCalled()
    })

    it('stamps a deterministic per-day jobId so a replayed tick dedupes in BullMQ', async () => {
      accounts._qb.getRawMany.mockResolvedValue([row({ id: 'a1' })])

      await scheduler.enqueueDailyBatch()
      await scheduler.enqueueDailyBatch()

      const jobIds = queue.add.mock.calls.map(call => (call[2] as { jobId: string }).jobId)
      expect(jobIds[0]).toBe(`watchlist-refresh:a1:${parisToday()}`)
      expect(jobIds[1]).toBe(jobIds[0])
    })
  })

  describe('kill switch', () => {
    it('does nothing (not even the query) when WATCHLIST_REFRESH_DISABLED=true', async () => {
      process.env['WATCHLIST_REFRESH_DISABLED'] = 'true'

      const enqueued = await scheduler.enqueueDailyBatch()

      expect(enqueued).toBe(0)
      expect(accounts.createQueryBuilder).not.toHaveBeenCalled()
      expect(queue.add).not.toHaveBeenCalled()
    })

    it('treats a cap of 0 as off', async () => {
      process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = '0'

      const enqueued = await scheduler.enqueueDailyBatch()

      expect(enqueued).toBe(0)
      expect(queue.add).not.toHaveBeenCalled()
    })
  })

  it('survives a queue.add failure on one account (échec isolé, batch continue)', async () => {
    accounts._qb.getRawMany.mockResolvedValueOnce([row({ id: 'a1' }), row({ id: 'a2' })])
    queue.add.mockRejectedValueOnce(new Error('redis down'))

    const enqueued = await scheduler.enqueueDailyBatch()

    expect(enqueued).toBe(1)
    expect(queue.add).toHaveBeenCalledTimes(2)
  })
})

describe('selectDailyBatch (pure)', () => {
  it('takes at most `cap` accounts per workspace, keeping stalest-first order', () => {
    const rows = [
      row({ id: 'a1', workspace_id: 'ws-1' }),
      row({ id: 'a2', workspace_id: 'ws-1' }),
      row({ id: 'a3', workspace_id: 'ws-1' }),
    ]
    expect(selectDailyBatch(rows, 2).map(r => r.id)).toEqual(['a1', 'a2'])
  })

  it('falls back to the owner user when workspace_id is null (legacy rows)', () => {
    const rows = [
      row({ id: 'a1', workspace_id: null, user_id: 'u1' }),
      row({ id: 'a2', workspace_id: null, user_id: 'u1' }),
      row({ id: 'b1', workspace_id: null, user_id: 'u2' }),
    ]
    expect(
      selectDailyBatch(rows, 1)
        .map(r => r.id)
        .sort(),
    ).toEqual(['a1', 'b1'])
  })

  it('interleaves workspaces round-robin so no tenant monopolises the morning', () => {
    const rows = [
      row({ id: 'a1', workspace_id: 'ws-1' }),
      row({ id: 'a2', workspace_id: 'ws-1' }),
      row({ id: 'b1', workspace_id: 'ws-2' }),
      row({ id: 'b2', workspace_id: 'ws-2' }),
    ]
    expect(selectDailyBatch(rows, 2).map(r => r.id)).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  it('returns [] on a non-positive cap', () => {
    expect(selectDailyBatch([row()], 0)).toEqual([])
    expect(selectDailyBatch([row()], -3)).toEqual([])
  })

  it('#4016 L7 — `null` = aucun plafond : tout le portefeuille, toujours entrelacé', () => {
    const rows = [
      row({ id: 'a1', workspace_id: 'ws-1' }),
      row({ id: 'a2', workspace_id: 'ws-1' }),
      row({ id: 'a3', workspace_id: 'ws-1' }),
      row({ id: 'b1', workspace_id: 'ws-2' }),
    ]
    expect(selectDailyBatch(rows, null).map(r => r.id)).toEqual(['a1', 'b1', 'a2', 'a3'])
  })

  it('#4016 L7 — un plafond PAR ESPACE (fonction) : chaque espace a le sien', () => {
    const rows = [
      row({ id: 'a1', workspace_id: 'ws-1' }),
      row({ id: 'a2', workspace_id: 'ws-1' }),
      row({ id: 'b1', workspace_id: 'ws-2' }),
      row({ id: 'b2', workspace_id: 'ws-2' }),
    ]
    const capOf = (tenant: WatchlistCandidateRow) => (tenant.workspace_id === 'ws-1' ? 1 : null)
    expect(selectDailyBatch(rows, capOf).map(r => r.id)).toEqual(['a1', 'b1', 'b2'])
  })
})

describe('#4016 L7 — parseWatchlistRefreshCap (UN réglage, plafond opérateur optionnel par plan)', () => {
  it('absent ou vide : aucun plafond — tout le portefeuille suivi, chaque jour', () => {
    expect(parseWatchlistRefreshCap(undefined)).toEqual({ off: false, fallback: null, byPlan: {} })
    expect(parseWatchlistRefreshCap('  ')).toEqual({ off: false, fallback: null, byPlan: {} })
  })

  it('`0` : la veille est COUPÉE (comme avant)', () => {
    expect(parseWatchlistRefreshCap('0')).toEqual({ off: true, fallback: 0, byPlan: {} })
  })

  it('un nombre seul : le même plafond pour tous les espaces (forme d’avant)', () => {
    expect(parseWatchlistRefreshCap('25')).toEqual({ off: false, fallback: 25, byPlan: {} })
  })

  it('`palier=N` et `*=N` : un plafond par plan, `*` pour les autres', () => {
    expect(parseWatchlistRefreshCap('growth=50, team=200, *=30')).toEqual({
      off: false,
      fallback: 30,
      byPlan: { growth: 50, team: 200 },
    })
  })

  it('SAIT DIRE NON : un morceau illisible est ignoré, jamais un plafond deviné', () => {
    expect(parseWatchlistRefreshCap('growth=beaucoup,team=-2,=4,team=12')).toEqual({
      off: false,
      fallback: null,
      byPlan: { team: 12 },
    })
    // Illisible en entier : comme absent — jamais « 0 », qui couperait la veille.
    expect(parseWatchlistRefreshCap('abc')).toEqual({ off: false, fallback: null, byPlan: {} })
  })
})

describe('#4016 L7 — plafond d’alertes « nouveau signal » relevé', () => {
  afterEach(() => {
    delete process.env['WATCHLIST_ALERTS_MAX_PER_DAY']
  })

  it('50 par destinataire et par jour par défaut (10 avant le 11/10/2026)', () => {
    delete process.env['WATCHLIST_ALERTS_MAX_PER_DAY']
    expect(maxSignalAlertsPerDay()).toBe(50)
  })

  it('le réglage reste souverain, `0` compris', () => {
    process.env['WATCHLIST_ALERTS_MAX_PER_DAY'] = '0'
    expect(maxSignalAlertsPerDay()).toBe(0)
  })
})

describe('#3916.a — la veille des registres publics (job `registry`)', () => {
  let accounts: MockRepository<AccountEntity>
  let queue: { add: jest.Mock }
  let scheduler: WatchlistRefreshScheduler

  beforeEach(() => {
    accounts = createMockRepository<AccountEntity>()
    queue = { add: jest.fn().mockResolvedValue(undefined) }
    scheduler = new WatchlistRefreshScheduler(accounts as never, queue as never)
    delete process.env['PUBLIC_REGISTRY_WATCH_DISABLED']
  })

  afterEach(() => {
    delete process.env['PUBLIC_REGISTRY_WATCH_DISABLED']
  })

  it('ne cible QUE les SIREN des comptes suivis au dossier complet — jamais tout le parc', async () => {
    accounts._qb.getRawMany.mockResolvedValueOnce([])

    await scheduler.enqueueRegistryBatch()

    // #4267.1 — les SIREN des comptes SUIVIS EXPLICITEMENT, jamais ceux d'un statut commercial.
    expect(accounts._qb.where).toHaveBeenCalledWith(activeFollowExists('account'))
    expect(JSON.stringify(accounts._qb.where.mock.calls.concat(accounts._qb.andWhere.mock.calls))).not.toContain(
      'commercial_status',
    )
    expect(accounts._qb.andWhere).toHaveBeenCalledWith('account.status = :completed', { completed: 'completed' })
    expect(accounts._qb.andWhere).toHaveBeenCalledWith("account.siren ~ '^[0-9]{9}$'")
  })

  it('un job par SIREN distinct et par jour, jamais plafonné par espace (sources gratuites)', async () => {
    accounts._qb.getRawMany.mockResolvedValueOnce([{ siren: '403355726' }, { siren: '552049447' }])

    const enqueued = await scheduler.enqueueRegistryBatch()

    expect(enqueued).toBe(2)
    expect(queue.add).toHaveBeenCalledWith(
      REGISTRY_WATCH_JOB,
      { siren: '403355726' },
      expect.objectContaining({ jobId: registryWatchJobId('403355726', parisToday()) }),
    )
  })

  it('le coupe-circuit arrête tout, sans même lire les comptes', async () => {
    process.env['PUBLIC_REGISTRY_WATCH_DISABLED'] = 'true'

    expect(await scheduler.enqueueRegistryBatch()).toBe(0)
    expect(accounts.createQueryBuilder).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })
})

// #4267.5 — ré-analyse des comptes suivis dont la dernière analyse a plus de 15 jours.
describe('WatchlistRefreshScheduler — ré-analyse à 15 jours (#4267.5)', () => {
  const NOW = new Date('2026-10-19T04:40:00Z')
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

  it('ne met en file que les suivis dus (16 j → oui, 14 j → non), un job par fenêtre', async () => {
    const accounts = createMockRepository<AccountEntity>()
    const queue = { add: jest.fn().mockResolvedValue(undefined) }
    const scheduler = new WatchlistRefreshScheduler(accounts as never, queue as never)
    accounts._qb.getRawMany.mockResolvedValueOnce([
      { id: 'due', user_id: 'u1', followed: true, last_analysis_at: daysAgo(16) },
      { id: 'fresh', user_id: 'u1', followed: true, last_analysis_at: daysAgo(14) },
    ])

    const count = await scheduler.enqueueReanalysisBatch(NOW)

    expect(count).toBe(1)
    expect(accounts._qb.where).toHaveBeenCalledWith(activeFollowExists('account'))
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(queue.add).toHaveBeenCalledWith(
      'reanalysis',
      { accountId: 'due', userId: 'u1' },
      expect.objectContaining({ jobId: expect.stringContaining('due') }),
    )
  })

  it('le kill switch de la veille coupe aussi la ré-analyse', async () => {
    process.env['WATCHLIST_REFRESH_DISABLED'] = 'true'
    const accounts = createMockRepository<AccountEntity>()
    const queue = { add: jest.fn() }
    const scheduler = new WatchlistRefreshScheduler(accounts as never, queue as never)

    expect(await scheduler.enqueueReanalysisBatch(NOW)).toBe(0)
    expect(queue.add).not.toHaveBeenCalled()
    delete process.env['WATCHLIST_REFRESH_DISABLED']
  })
})
