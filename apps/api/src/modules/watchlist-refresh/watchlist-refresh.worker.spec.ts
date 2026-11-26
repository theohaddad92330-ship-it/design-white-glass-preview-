import { UnrecoverableError, type Job } from 'bullmq'
import { failure, success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { activeFollowExists } from '../account-follows/account-follow.entity'
import { WatchlistRefreshWorker } from './watchlist-refresh.worker'
import {
  REGISTRY_WATCH_JOB,
  signalKeys,
  type RegistryWatchJobData,
  type WatchlistRefreshJobData,
} from './watchlist-refresh.queue'

function account(over: Partial<AccountEntity> = {}): AccountEntity {
  return {
    id: 'acc-1',
    user_id: 'u1',
    workspace_id: 'ws-1',
    company_name: 'Doctolib',
    status: 'completed',
    commercial_status: 'watching',
    recent_signals: [],
    priority_score: 50,
    ...over,
  } as AccountEntity
}

function job(data: Partial<WatchlistRefreshJobData> = {}): Job<WatchlistRefreshJobData> {
  return { id: 'j1', data: { accountId: 'acc-1', userId: 'u1', ...data } } as Job<WatchlistRefreshJobData>
}

const signalA = { signal: 'Levée de fonds 50M€', date: '2026-07-01', source: 'Les Échos' }
const signalB = { signal: 'Nouveau DSI nommé', date: '2026-07-14', source: 'LinkedIn' }

describe('WatchlistRefreshWorker', () => {
  let accounts: MockRepository<AccountEntity>
  let onDemand: { refreshResearch: jest.Mock }
  let notifications: { notifyBuySignalForAccount: jest.Mock }
  let worker: WatchlistRefreshWorker

  beforeEach(() => {
    accounts = createMockRepository<AccountEntity>()
    // #4267.1 — par défaut le compte du job est SUIVI explicitement (le test du non-suivi le dit).
    accounts.query.mockResolvedValue([{ followed: true }])
    onDemand = { refreshResearch: jest.fn().mockResolvedValue(success({ refreshed: true })) }
    notifications = { notifyBuySignalForAccount: jest.fn().mockResolvedValue(undefined) }
    worker = new WatchlistRefreshWorker(accounts as never, onDemand as never, notifications as never)
  })

  it('refreshes via the UN-BILLED on-demand path, scoped to the account owner', async () => {
    // The manual "Actualiser" button goes through AnalysisRefreshService and
    // debits 1 enrichment credit; the system cron must NOT — it calls
    // AnalysisOnDemandService.refreshResearch directly (same underlying
    // dimension refresh, no CreditsService anywhere in this worker's graph).
    accounts.findOne.mockResolvedValueOnce(account({ user_id: 'owner-9' })).mockResolvedValueOnce(account())

    const outcome = await worker.process(job())

    expect(outcome).toBe('refreshed')
    expect(onDemand.refreshResearch).toHaveBeenCalledTimes(1)
    // LOT (15/10) DATA-A point 2 (veille) + DATA-C (voie « lot », moitié prix).
    expect(onDemand.refreshResearch).toHaveBeenCalledWith('acc-1', 'owner-9', { watch: true, llmLane: 'batch' })
  })

  describe('nouveaux signaux → flux buy_signal existant', () => {
    it('notifies when the refresh surfaced a signal that was not there before', async () => {
      accounts.findOne
        .mockResolvedValueOnce(account({ recent_signals: [signalA] as never }))
        .mockResolvedValueOnce(account({ recent_signals: [signalA, signalB] as never }))

      await worker.process(job())

      // Reuses notifyBuySignalForAccount as-is: pref gate `buy_signals`,
      // in-app notification AND outbound integrations fan-out included.
      expect(notifications.notifyBuySignalForAccount).toHaveBeenCalledTimes(1)
      // #3920.a — la cloche nomme LE fait neuf (ici le DSI), pas « N signaux ».
      expect(notifications.notifyBuySignalForAccount).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({ label: 'Nouveau DSI nommé', source: 'LinkedIn', date: '2026-07-14' }),
      )
    })

    it('#2875 (#2402.1, #2402.3) — un signal neuf écrit AUSSI un TriggerEvent canonique « signal_nouveau »', async () => {
      const triggers = { recordOnceByDedupeKey: jest.fn(async () => undefined) }
      const workerWithTriggers = new WatchlistRefreshWorker(
        accounts as never,
        onDemand as never,
        notifications as never,
        undefined,
        triggers as never,
      )
      accounts.findOne
        .mockResolvedValueOnce(account({ recent_signals: [signalA] as never }))
        .mockResolvedValueOnce(account({ recent_signals: [signalA, signalB] as never }))

      await workerWithTriggers.process(job())

      expect(triggers.recordOnceByDedupeKey).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'signal_nouveau',
          source: 'watchlist-refresh',
          scope: expect.objectContaining({ workspaceId: 'ws-1' }),
          object: expect.objectContaining({ subjectType: 'account', subjectId: 'acc-1' }),
        }),
        'watchlist-refresh/watchlist-refresh.worker',
      )
    })

    it('#2875 — aucun signal neuf n’écrit PAS de TriggerEvent canonique', async () => {
      const triggers = { recordOnceByDedupeKey: jest.fn(async () => undefined) }
      const workerWithTriggers = new WatchlistRefreshWorker(
        accounts as never,
        onDemand as never,
        notifications as never,
        undefined,
        triggers as never,
      )
      accounts.findOne
        .mockResolvedValueOnce(account({ recent_signals: [signalA] as never }))
        .mockResolvedValueOnce(account({ recent_signals: [signalA] as never }))

      await workerWithTriggers.process(job())

      expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
    })

    it('stays silent when the refresh returned the same signals (no daily spam)', async () => {
      accounts.findOne
        .mockResolvedValueOnce(account({ recent_signals: [signalA] as never }))
        .mockResolvedValueOnce(account({ recent_signals: [signalA] as never }))

      await worker.process(job())

      expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
    })

    it('stays silent when signals merely got reordered or re-cased', async () => {
      accounts.findOne
        .mockResolvedValueOnce(account({ recent_signals: [signalA, signalB] as never }))
        .mockResolvedValueOnce(
          account({ recent_signals: [signalB, { ...signalA, signal: 'LEVÉE DE FONDS 50M€' }] as never }),
        )

      await worker.process(job())

      expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
    })

    it('still completes the refresh when the notification trigger throws (best-effort)', async () => {
      accounts.findOne
        .mockResolvedValueOnce(account({ recent_signals: [] as never }))
        .mockResolvedValueOnce(account({ recent_signals: [signalA] as never }))
      notifications.notifyBuySignalForAccount.mockRejectedValueOnce(new Error('boom'))

      await expect(worker.process(job())).resolves.toBe('refreshed')
    })
  })

  describe('garde-fous au moment du run (le job peut partir des heures après le tick)', () => {
    it('skips an account no longer followed', async () => {
      accounts.query.mockResolvedValue([{ followed: false }])
      accounts.findOne.mockResolvedValueOnce(account({ commercial_status: 'archived' }))

      const outcome = await worker.process(job())

      expect(outcome).toBe('skipped')
      expect(onDemand.refreshResearch).not.toHaveBeenCalled()
    })

    // #4267.1 — LE test qui doit savoir dire NON : le statut commercial ne suffit plus à payer la veille.
    it('skips an account whose commercial status says « suivi » but that NOBODY follows explicitly', async () => {
      accounts.query.mockResolvedValue([{ followed: false }])
      accounts.findOne.mockResolvedValueOnce(account({ commercial_status: 'watching' }))

      const outcome = await worker.process(job())

      expect(outcome).toBe('skipped')
      expect(onDemand.refreshResearch).not.toHaveBeenCalled()
      expect(accounts.query).toHaveBeenCalledWith(expect.stringContaining('FROM account_follows follow'), ['acc-1'])
    })

    it('refreshes an account followed explicitly even when its commercial status is not a « suivi » one', async () => {
      accounts.findOne
        .mockResolvedValueOnce(account({ commercial_status: 'inbox' }))
        .mockResolvedValueOnce(account({ commercial_status: 'inbox' }))

      await expect(worker.process(job())).resolves.toBe('refreshed')
    })

    it('skips an account whose analysis is not completed', async () => {
      accounts.findOne.mockResolvedValueOnce(account({ status: 'analyzing' }))

      const outcome = await worker.process(job())

      expect(outcome).toBe('skipped')
      expect(onDemand.refreshResearch).not.toHaveBeenCalled()
    })

    it('skips a deleted account', async () => {
      accounts.findOne.mockResolvedValueOnce(null)

      const outcome = await worker.process(job())

      expect(outcome).toBe('skipped')
      expect(onDemand.refreshResearch).not.toHaveBeenCalled()
    })
  })

  describe('échec isolé', () => {
    it('throws (job failed) when the IA refresh fails — next tick is tomorrow, never re-billed today', async () => {
      accounts.findOne.mockResolvedValueOnce(account())
      onDemand.refreshResearch.mockResolvedValueOnce(failure({ code: 'ia_failed', message: 'IA down' }))

      await expect(worker.process(job())).rejects.toThrow('IA down')
      expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
    })

    it('BELLUM-API-7 — un precondition_failed est définitif : UnrecoverableError, jamais de relance', async () => {
      accounts.findOne.mockResolvedValueOnce(account())
      onDemand.refreshResearch.mockResolvedValueOnce(
        failure({ code: 'precondition_failed', message: 'Espace de démonstration : figé' }),
      )

      await expect(worker.process(job())).rejects.toBeInstanceOf(UnrecoverableError)
    })
  })
})

describe('signalKeys (pure)', () => {
  it('keys on label + date + source, reading the same loose fields as the Cockpit', () => {
    const keys = signalKeys([
      { signal: 'Levée de fonds', date: '2026-07-01', source: 'Les Échos' },
      { title: 'Nouveau DSI', date: '2026-07-14' },
      { label: 'Plan de recrutement' },
    ])
    expect(keys.size).toBe(3)
  })

  it('ignores unlabelled items, non-objects and non-arrays', () => {
    expect(signalKeys([{ date: '2026-07-01' }, null, 42, 'x']).size).toBe(0)
    expect(signalKeys(null).size).toBe(0)
    expect(signalKeys(undefined).size).toBe(0)
    expect(signalKeys('not-an-array').size).toBe(0)
  })

  it('is case/whitespace-insensitive so a re-scrape does not count as new', () => {
    const a = signalKeys([{ signal: ' Levée de fonds ', date: '2026-07-01', source: 'Les Échos' }])
    const b = signalKeys([{ signal: 'levée de fonds', date: '2026-07-01', source: 'les échos' }])
    expect([...a]).toEqual([...b])
  })

  it('#3920 — un signal PÉRIMÉ ne compte jamais comme neuf (isSignalArchived, source unique)', () => {
    const now = new Date('2026-10-15T00:00:00Z')
    const keys = signalKeys(
      [
        { signal: 'Vieille annonce BODACC', date: '2019-01-01', freshness: 'archive' },
        { signal: 'Vieille annonce, date seule', date: '2019-01-01' },
        { signal: 'Signal actuel', date: '2026-10-01' },
      ],
      now,
    )
    expect(keys.size).toBe(1)
    expect([...keys][0]).toContain('signal actuel')
  })
})

describe('#3916.a — job `registry` : la collecte BODACC continue', () => {
  function registryJob(siren = '403355726'): Job<RegistryWatchJobData> {
    return { id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren } } as Job<RegistryWatchJobData>
  }

  it('collecte le SIREN sans jamais relancer la recherche payante', async () => {
    const accounts = createMockRepository<AccountEntity>()
    accounts.query.mockResolvedValue([{ followed: true }])
    const onDemand = { refreshResearch: jest.fn() }
    const registry = {
      collectBodacc: jest.fn().mockResolvedValue({ firstPass: false, failed: false, written: 2 }),
      rowsFor: jest.fn().mockResolvedValue([]),
      syncEsnRisk: jest.fn().mockResolvedValue(null),
      collectSirene: jest.fn().mockResolvedValue({ configured: true, failed: false, openings: 0 }),
    }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      onDemand as never,
      { notifyBuySignalForAccount: jest.fn() } as never,
      undefined,
      undefined,
      registry as never,
    )

    const outcome = await worker.process(registryJob() as never)

    expect(outcome).toBe('collected')
    expect(registry.collectBodacc).toHaveBeenCalledWith('403355726', expect.any(Date))
    expect(onDemand.refreshResearch).not.toHaveBeenCalled()
  })

  it('une lecture en panne fait échouer le job (visible), jamais un succès muet', async () => {
    const registry = {
      collectBodacc: jest.fn().mockResolvedValue({ firstPass: false, failed: true, written: 0 }),
      rowsFor: jest.fn().mockResolvedValue([]),
      syncEsnRisk: jest.fn().mockResolvedValue(null),
      collectSirene: jest.fn().mockResolvedValue({ configured: true, failed: false, openings: 0 }),
    }
    const worker = new WatchlistRefreshWorker(
      createMockRepository<AccountEntity>() as never,
      { refreshResearch: jest.fn() } as never,
      { notifyBuySignalForAccount: jest.fn() } as never,
      undefined,
      undefined,
      registry as never,
    )

    await expect(worker.process(registryJob() as never)).rejects.toThrow(/BODACC/)
  })

  it('sans collecteur câblé, le job ne fait rien (no-op strict)', async () => {
    const worker = new WatchlistRefreshWorker(
      createMockRepository<AccountEntity>() as never,
      { refreshResearch: jest.fn() } as never,
      { notifyBuySignalForAccount: jest.fn() } as never,
    )
    expect(await worker.process(registryJob() as never)).toBe('skipped')
  })
})

describe('#3921.a — job `registry` : le relevé Sirene du jour', () => {
  function registryJob(siren = '403355726'): Job<RegistryWatchJobData> {
    return { id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren } } as Job<RegistryWatchJobData>
  }
  function workerWith(registry: Record<string, jest.Mock>): WatchlistRefreshWorker {
    return new WatchlistRefreshWorker(
      createMockRepository<AccountEntity>() as never,
      { refreshResearch: jest.fn() } as never,
      { notifyBuySignalForAccount: jest.fn() } as never,
      undefined,
      undefined,
      registry as never,
    )
  }

  it('relève Sirene chaque jour, après BODACC, pour le même SIREN', async () => {
    const registry = {
      collectBodacc: jest.fn().mockResolvedValue({ firstPass: false, failed: false, written: 0 }),
      collectSirene: jest.fn().mockResolvedValue({ configured: true, failed: false, openings: 1 }),
      syncEsnRisk: jest.fn().mockResolvedValue(null),
      rowsFor: jest.fn().mockResolvedValue([]),
    }
    expect(await workerWith(registry).process(registryJob() as never)).toBe('collected')
    expect(registry.collectSirene).toHaveBeenCalledWith('403355726', expect.any(Date))
  })

  it('une panne Sirene fait échouer le job — APRÈS que BODACC a été lu et écrit', async () => {
    const registry = {
      collectBodacc: jest.fn().mockResolvedValue({ firstPass: false, failed: false, written: 1 }),
      collectSirene: jest.fn().mockResolvedValue({ configured: true, failed: true, openings: 0 }),
      syncEsnRisk: jest.fn().mockResolvedValue(null),
      rowsFor: jest.fn().mockResolvedValue([]),
    }
    await expect(workerWith(registry).process(registryJob() as never)).rejects.toThrow(/Sirene/)
    expect(registry.collectBodacc).toHaveBeenCalled()
  })
})

describe('#3920.a — le diff couvre TOUTES les sources, pas seulement recent_signals', () => {
  afterEach(() => {
    delete process.env['WATCHLIST_ALERTS_MAX_PER_DAY']
  })

  const offer = {
    title: 'Architecte cloud (H/F)',
    date: '2026-10-02',
    url: 'https://candidat.francetravail.fr/offres/recherche/detail/200ABC',
    source: 'France Travail',
  }

  it('une nouvelle OFFRE (raw_analysis.it_job_signals) déclenche une alerte nommée, avec son lien', async () => {
    const accounts = createMockRepository<AccountEntity>()
    accounts.query.mockResolvedValue([{ followed: true }])
    const notifications = { notifyBuySignalForAccount: jest.fn().mockResolvedValue(undefined) }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      { refreshResearch: jest.fn().mockResolvedValue(success({ refreshed: true })) } as never,
      notifications as never,
    )
    accounts.findOne
      .mockResolvedValueOnce(account({ raw_analysis: { it_job_signals: [] } as never }))
      .mockResolvedValueOnce(account({ raw_analysis: { it_job_signals: [offer] } as never }))

    await worker.process(job())

    expect(notifications.notifyBuySignalForAccount).toHaveBeenCalledWith('acc-1', {
      label: 'Architecte cloud (H/F)',
      source: 'France Travail',
      date: '2026-10-02',
      url: offer.url,
      body: 'Architecte cloud (H/F) (02/10/2026)',
    })
  })

  it('une annonce BODACC neuve lue par la veille des registres prévient le titulaire du compte suivi', async () => {
    const accounts = createMockRepository<AccountEntity>()
    accounts.query.mockResolvedValue([{ followed: true }])
    accounts._qb.getMany.mockResolvedValue([account({ siren: '403355726' } as never)])
    const notifications = { notifyBuySignalForAccount: jest.fn().mockResolvedValue(undefined) }
    const row = {
      source: 'bodacc',
      ref: 'A1',
      kind: 'collective_proceeding',
      family_label: 'Procédures collectives',
      published_on: '2026-10-05',
      url: 'https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:A1',
    }
    const registry = {
      rowsFor: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]),
      collectBodacc: jest.fn().mockResolvedValue({ firstPass: false, failed: false, written: 1 }),
      collectSirene: jest.fn().mockResolvedValue({ configured: true, failed: false, openings: 0 }),
      syncEsnRisk: jest.fn().mockResolvedValue(null),
    }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      { refreshResearch: jest.fn() } as never,
      notifications as never,
      undefined,
      undefined,
      registry as never,
    )

    await worker.process({ id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren: '403355726' } } as never)
    // #4267.1 — les « followers » d'un SIREN sont les comptes SUIVIS EXPLICITEMENT, jamais un statut commercial.
    expect(accounts._qb.andWhere).toHaveBeenCalledWith(activeFollowExists('account'))
    expect(JSON.stringify(accounts._qb.where.mock.calls.concat(accounts._qb.andWhere.mock.calls))).not.toContain(
      'commercial_status',
    )

    expect(notifications.notifyBuySignalForAccount).toHaveBeenCalledWith('acc-1', {
      label: 'Procédures collectives',
      source: 'BODACC',
      date: '2026-10-05',
      url: row.url,
      body: 'Procédures collectives (05/10/2026)',
    })
  })

  describe('#3920.8 — les marchés attribués lus par la veille', () => {
    const awardRow = {
      source: 'decp',
      ref: 'abc123def4567890',
      kind: 'award',
      family_label: 'TMA du SI achats',
      published_on: '2026-10-02',
      url: null,
    }

    function buildAwardsWorker(awardsOutcome: { firstPass: boolean; failed: boolean; written: number }) {
      const accounts = createMockRepository<AccountEntity>()
      accounts.query.mockResolvedValue([{ followed: true }])
      accounts._qb.getMany.mockResolvedValue([account({ siren: '403355726' } as never)])
      const notifications = { notifyBuySignalForAccount: jest.fn().mockResolvedValue(undefined) }
      const registry = {
        rowsFor: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([awardRow]),
        collectBodacc: jest.fn().mockResolvedValue({ firstPass: false, failed: false, written: 0 }),
        collectSirene: jest.fn().mockResolvedValue({ configured: false, failed: false, openings: 0 }),
        collectAwards: jest.fn().mockResolvedValue(awardsOutcome),
        syncEsnRisk: jest.fn().mockResolvedValue(null),
      }
      const worker = new WatchlistRefreshWorker(
        accounts as never,
        { refreshResearch: jest.fn() } as never,
        notifications as never,
        undefined,
        undefined,
        registry as never,
      )
      return { worker, notifications, registry }
    }

    it('un marché attribué neuf (curseur déjà posé) prévient, sous le libellé « Marchés publics attribués » (#3915.decp)', async () => {
      const { worker, notifications, registry } = buildAwardsWorker({ firstPass: false, failed: false, written: 1 })
      await worker.process({ id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren: '403355726' } } as never)
      expect(registry.collectAwards).toHaveBeenCalledWith('403355726', expect.any(String), expect.any(Date))
      expect(notifications.notifyBuySignalForAccount).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({ label: 'TMA du SI achats', source: 'Marchés publics attribués', date: '2026-10-02' }),
      )
    })

    it('premier passage des marchés : 24 mois d’historique ne font RIEN sonner', async () => {
      const { worker, notifications } = buildAwardsWorker({ firstPass: true, failed: false, written: 1 })
      await worker.process({ id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren: '403355726' } } as never)
      expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
    })
  })

  describe('#3921.9 — les événements du registre national lus par la veille', () => {
    const rneRow = {
      source: 'rne',
      ref: 'pouvoir:r1:a:2026-10-02',
      kind: 'executive_change',
      family_label: 'Nomination — Jeanne DUPONT (Président)',
      published_on: '2026-10-02',
      url: 'https://annuaire-entreprises.data.gouv.fr/dirigeants/403355726#evt-2026-10-02',
    }

    function buildRneWorker(rneOutcome: unknown) {
      const accounts = createMockRepository<AccountEntity>()
      accounts.query.mockResolvedValue([{ followed: true }])
      accounts._qb.getMany.mockResolvedValue([account({ siren: '403355726' } as never)])
      const notifications = { notifyBuySignalForAccount: jest.fn().mockResolvedValue(undefined) }
      const registry = {
        rowsFor: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([rneRow]),
        collectBodacc: jest.fn().mockResolvedValue({ firstPass: false, failed: false, written: 0 }),
        collectSirene: jest.fn().mockResolvedValue({ configured: false, failed: false, openings: 0 }),
        collectRne:
          rneOutcome instanceof Error
            ? jest.fn().mockRejectedValue(rneOutcome)
            : jest.fn().mockResolvedValue(rneOutcome),
        syncEsnRisk: jest.fn().mockResolvedValue(null),
      }
      const worker = new WatchlistRefreshWorker(
        accounts as never,
        { refreshResearch: jest.fn() } as never,
        notifications as never,
        undefined,
        undefined,
        registry as never,
      )
      return { worker, notifications, registry }
    }

    it('un événement neuf (curseur déjà posé) prévient, sous « Registre national des entreprises »', async () => {
      const { worker, notifications, registry } = buildRneWorker({
        configured: true,
        firstPass: false,
        failed: false,
        written: 1,
      })
      await worker.process({ id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren: '403355726' } } as never)
      expect(registry.collectRne).toHaveBeenCalledWith('403355726', expect.any(Date))
      expect(notifications.notifyBuySignalForAccount).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({ source: 'Registre national des entreprises', date: '2026-10-02' }),
      )
    })

    it('premier passage : l’historique du registre ne fait RIEN sonner', async () => {
      const { worker, notifications } = buildRneWorker({ configured: true, firstPass: true, failed: false, written: 1 })
      await worker.process({ id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren: '403355726' } } as never)
      expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
    })

    it('une panne du registre national n’arrête pas la veille (non fatale)', async () => {
      const { worker, registry } = buildRneWorker(new Error('boom'))
      await expect(
        worker.process({ id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren: '403355726' } } as never),
      ).resolves.toBe('collected')
      expect(registry.syncEsnRisk).toHaveBeenCalled()
    })
  })

  it('premier passage sur un SIREN : l’historique lu ne fait RIEN sonner', async () => {
    const accounts = createMockRepository<AccountEntity>()
    accounts.query.mockResolvedValue([{ followed: true }])
    accounts._qb.getMany.mockResolvedValue([account({ siren: '403355726' } as never)])
    const notifications = { notifyBuySignalForAccount: jest.fn() }
    const registry = {
      rowsFor: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { source: 'bodacc', ref: 'A1', kind: 'sale', family_label: 'Ventes', published_on: '2026-09-01', url: null },
        ]),
      collectBodacc: jest.fn().mockResolvedValue({ firstPass: true, failed: false, written: 1 }),
      collectSirene: jest.fn().mockResolvedValue({ configured: true, failed: false, openings: 0 }),
      syncEsnRisk: jest.fn().mockResolvedValue(null),
    }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      { refreshResearch: jest.fn() } as never,
      notifications as never,
      undefined,
      undefined,
      registry as never,
    )
    await worker.process({ id: 'r1', name: REGISTRY_WATCH_JOB, data: { siren: '403355726' } } as never)
    expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
  })

  it('le plafond d’alertes (UN réglage, WATCHLIST_ALERTS_MAX_PER_DAY) fait taire la cloche, jamais le signal', async () => {
    const accounts = createMockRepository<AccountEntity>()
    accounts.query.mockResolvedValue([{ followed: true }])
    const notifications = { notifyBuySignalForAccount: jest.fn() }
    const alertCap = { allows: jest.fn().mockResolvedValue(false) }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      { refreshResearch: jest.fn().mockResolvedValue(success({ refreshed: true })) } as never,
      notifications as never,
      undefined,
      undefined,
      undefined,
      alertCap as never,
    )
    accounts.findOne
      .mockResolvedValueOnce(account({ recent_signals: [] as never }))
      .mockResolvedValueOnce(account({ recent_signals: [signalB] as never }))

    expect(await worker.process(job())).toBe('refreshed')
    expect(alertCap.allows).toHaveBeenCalledWith('u1', expect.any(Date))
    expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
  })

  it('#3920.k — un signal SANS DATE n’est jamais « nouveau » : ni cloche, ni événement', async () => {
    const accounts = createMockRepository<AccountEntity>()
    accounts.query.mockResolvedValue([{ followed: true }])
    const notifications = { notifyBuySignalForAccount: jest.fn() }
    const triggers = { recordOnceByDedupeKey: jest.fn(async () => undefined) }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      { refreshResearch: jest.fn().mockResolvedValue(success({ refreshed: true })) } as never,
      notifications as never,
      undefined,
      triggers as never,
    )
    accounts.findOne
      .mockResolvedValueOnce(account({ recent_signals: [] as never }))
      .mockResolvedValueOnce(account({ recent_signals: [{ signal: 'Rumeur sans date' }] as never }))
    await worker.process(job())
    expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
    expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
  })

  it('#3920.k — plusieurs faits neufs : un SEUL appel, le corps nomme le plus récent + « et N autre »', async () => {
    const accounts = createMockRepository<AccountEntity>()
    accounts.query.mockResolvedValue([{ followed: true }])
    const notifications = { notifyBuySignalForAccount: jest.fn().mockResolvedValue(undefined) }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      { refreshResearch: jest.fn().mockResolvedValue(success({ refreshed: true })) } as never,
      notifications as never,
    )
    accounts.findOne
      .mockResolvedValueOnce(account({ recent_signals: [] as never }))
      .mockResolvedValueOnce(account({ recent_signals: [signalA, signalB] as never }))
    await worker.process(job())
    expect(notifications.notifyBuySignalForAccount).toHaveBeenCalledTimes(1)
    expect(notifications.notifyBuySignalForAccount).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({ body: 'Nouveau DSI nommé (14/07/2026) — et 1 autre' }),
    )
  })

  it('plafond à 0 : aucune alerte système, même sans compteur câblé', async () => {
    process.env['WATCHLIST_ALERTS_MAX_PER_DAY'] = '0'
    const accounts = createMockRepository<AccountEntity>()
    accounts.query.mockResolvedValue([{ followed: true }])
    const notifications = { notifyBuySignalForAccount: jest.fn() }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      { refreshResearch: jest.fn().mockResolvedValue(success({ refreshed: true })) } as never,
      notifications as never,
    )
    accounts.findOne
      .mockResolvedValueOnce(account({ recent_signals: [] as never }))
      .mockResolvedValueOnce(account({ recent_signals: [signalB] as never }))
    await worker.process(job())
    expect(notifications.notifyBuySignalForAccount).not.toHaveBeenCalled()
  })
})

// #4267.5 — le job `reanalysis` relance une analyse ordinaire d'un compte suivi, relue éligible au passage.
describe('WatchlistRefreshWorker — ré-analyse à 15 jours (#4267.5)', () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const build = (lastAnalysis: Date | null, followed = true) => {
    const accounts = createMockRepository<AccountEntity>()
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      user_id: 'u1',
      status: 'completed',
      company_name: 'Acme',
      siren: '123456789',
    } as never)
    accounts.query.mockResolvedValueOnce([{ followed }]).mockResolvedValueOnce([{ last: lastAnalysis }])
    const analysis = { start: jest.fn().mockResolvedValue(success({ launched: true })) }
    const worker = new WatchlistRefreshWorker(
      accounts as never,
      { refreshResearch: jest.fn() } as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      analysis as never,
    )
    return { worker, analysis }
  }
  const job = { name: 'reanalysis', data: { accountId: 'acc-1', userId: 'u1' } } as never

  it('dernière analyse à 16 jours → lancement d’analyse ordinaire (crédits débités par le lancement)', async () => {
    const { worker, analysis } = build(daysAgo(16))

    expect(await worker.process(job)).toBe('refreshed')
    expect(analysis.start).toHaveBeenCalledWith({ company_name: 'Acme', siren: '123456789' }, 'u1')
  })

  it('dernière analyse à 14 jours → rien', async () => {
    const { worker, analysis } = build(daysAgo(14))

    expect(await worker.process(job)).toBe('skipped')
    expect(analysis.start).not.toHaveBeenCalled()
  })

  it('suivi retiré entre le tick et le job → rien', async () => {
    const { worker, analysis } = build(daysAgo(30), false)

    expect(await worker.process(job)).toBe('skipped')
    expect(analysis.start).not.toHaveBeenCalled()
  })
})
