import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import {
  AdminQueuesService,
  ancienneteDuPlusVieuxEnAttente,
  type AdminQueueOldestWaiting,
  type AdminQueueUnknownReason,
} from './admin-queues.service'

/**
 * Build an {@link AdminQueuesService} onto in-memory BullMQ queue mocks. Each
 * queue exposes the getters/mutations the service touches (`getJobCounts`,
 * `getJobs`, `getJobCountByTypes`, `getJob`, `clean`). This mirrors how the real
 * service is fed — the `analysis` + `mailer` queues injected via `@InjectQueue`.
 */
function makeQueueMock(overrides: Partial<Record<keyof Queue, unknown>> = {}) {
  return {
    getJobCounts: jest.fn().mockResolvedValue({}),
    getJobs: jest.fn().mockResolvedValue([]),
    getJobCountByTypes: jest.fn().mockResolvedValue(0),
    getJob: jest.fn().mockResolvedValue(null),
    clean: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as Queue
}

function makeService(opts: { analysis?: Queue; mailer?: Queue } = {}) {
  const analysis = opts.analysis ?? makeQueueMock()
  const mailer = opts.mailer ?? makeQueueMock()
  const service = new AdminQueuesService(analysis, mailer)
  return { service, analysis, mailer }
}

/** A failed analysis job carrying the useful debugging fields plus fields that
 *  must NEVER be surfaced (the ESN profile blob, the run's user context). */
function failedAnalysisJob(): Job {
  return {
    id: 'job-1',
    name: 'analyze',
    data: {
      accountId: 'acc-123',
      companyName: 'Qonto',
      userId: 'user-9',
      workspaceId: 'ws-1',
      siren: '820123456',
      scopeMode: 'strict',
      country: 'FR',
      correlationId: 'corr-abc',
      // ── must be stripped ──
      profileData: { offers: ['a', 'b'], secretIshBlob: 'x'.repeat(5000) },
      userContext: 'private note from the sales rep',
      accountFeedback: [{ note: 'internal' }],
    },
    attemptsMade: 1,
    timestamp: 1_700_000_000_000,
    processedOn: 1_700_000_001_000,
    finishedOn: 1_700_000_002_000,
    failedReason: 'IA service returned 500',
    stacktrace: [
      'Error: IA service returned 500\n    at IaClient.post (/app/ia-client.ts:42:11)\n    at AnalysisWorker.run (/app/worker.ts:88:7)',
    ],
  } as unknown as Job
}

describe('AdminQueuesService', () => {
  describe('listQueues', () => {
    it('reports both queue depths from getJobCounts', async () => {
      const analysis = makeQueueMock({
        getJobCounts: jest
          .fn()
          .mockResolvedValue({ waiting: 4, active: 2, completed: 100, failed: 3, delayed: 1, paused: 0 }),
      })
      const mailer = makeQueueMock({
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 5, failed: 1, delayed: 0 }),
      })
      const { service } = makeService({ analysis, mailer })

      const queues = await service.listQueues()

      expect(queues.map(q => q.name)).toEqual(['analysis', 'mailer'])
      const a = queues.find(q => q.name === 'analysis')!
      expect(a.waiting).toBe(4)
      expect(a.failed).toBe(3)
      expect(a.completed).toBe(100)
      // Missing keys coerce to 0 (not NaN/undefined).
      const m = queues.find(q => q.name === 'mailer')!
      expect(m.paused).toBe(0)
    })

    // #1662 — "since when is this queue stuck?" An operator staring at
    // `waiting: 40` learns nothing about whether that backlog is three
    // minutes old or three days old.
    it('reports the age of the OLDEST waiting job (ms since it was added)', async () => {
      const now = new Date('2026-09-07T12:00:00.000Z')
      const oldestWaiting = { id: 'w-1', timestamp: now.getTime() - 15 * 60_000 } as unknown as Job
      const getJobs = jest.fn().mockResolvedValue([oldestWaiting])
      const analysis = makeQueueMock({
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 3, active: 0, completed: 0, failed: 0, delayed: 0 }),
        getJobs,
      })
      const { service } = makeService({ analysis })

      const queues = await service.listQueues(now)

      const a = queues.find(q => q.name === 'analysis')!
      expect(a.oldestWaiting).toEqual({ etat: 'mesure', plusVieuxMs: 15 * 60_000 })
      // The OLDEST job — asc=true asks BullMQ for ascending (soonest-to-run)
      // order, and a single element (start=end=0) is enough.
      expect(getJobs).toHaveBeenCalledWith(['waiting'], 0, 0, true)
    })

    // ⚠️ "no job waiting" is NOT "waiting zero minutes" — an empty queue has
    // no age (doctrine: UnknownValue, GA-18/GA-19). A summary that wrote `0`
    // here would claim a false thing: that the queue is perfectly healthy.
    it('reports { etat: "vide" } for a queue with no waiting job — never a 0 age', async () => {
      const analysis = makeQueueMock({
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
        getJobs: jest.fn().mockResolvedValue([]),
      })
      const { service } = makeService({ analysis })

      const queues = await service.listQueues()

      const a = queues.find(q => q.name === 'analysis')!
      expect(a.oldestWaiting).toEqual({ etat: 'vide' })
      expect(a.oldestWaiting).not.toHaveProperty('plusVieuxMs')
    })

    // ⚠️ LE CAS QUE `number | null` NE SAVAIT PAS DIRE. Redis muet ne rend pas
    // une file saine : il rend un état inconnu, et l'écran doit le dire plutôt
    // que d'écrire « aucun job en attente » sur une file peut-être bloquée.
    it('reports { etat: "inconnu" } when the oldest-job read fails — a Redis outage is not an empty queue', async () => {
      const analysis = makeQueueMock({
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 7, active: 0, completed: 0, failed: 0, delayed: 0 }),
        getJobs: jest.fn().mockRejectedValue(new Error('redis://default:s3cr3t@host:6379 — connection refused')),
      })
      const { service } = makeService({ analysis })

      const queues = await service.listQueues()

      const a = queues.find(q => q.name === 'analysis')!
      expect(a.oldestWaiting).toEqual({ etat: 'inconnu', raison: 'lecture-impossible' })
      // Les profondeurs, elles, restent servies : une panne PARTIELLE reste une
      // réponse partielle, elle ne vide pas l'écran entier.
      expect(a.waiting).toBe(7)
      // ⚠️ Et le mot de passe de l'URL Redis NE SORT PAS : la raison est un
      // vocabulaire fermé, jamais le message d'exception.
      expect(JSON.stringify(a)).not.toContain('s3cr3t')
    })

    it('reports { etat: "inconnu" } when the counts announce waiting jobs but none could be read', async () => {
      const analysis = makeQueueMock({
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 4 }),
        getJobs: jest.fn().mockResolvedValue([]),
      })
      const { service } = makeService({ analysis })

      const queues = await service.listQueues()

      expect(queues.find(q => q.name === 'analysis')!.oldestWaiting).toEqual({
        etat: 'inconnu',
        raison: 'comptes-et-file-divergent',
      })
    })

    it('never goes negative when the queue clock is slightly ahead of `now`', async () => {
      const now = new Date('2026-09-07T12:00:00.000Z')
      const oldestWaiting = { id: 'w-1', timestamp: now.getTime() + 5_000 } as unknown as Job
      const analysis = makeQueueMock({
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 1 }),
        getJobs: jest.fn().mockResolvedValue([oldestWaiting]),
      })
      const { service } = makeService({ analysis })

      const queues = await service.listQueues(now)

      expect(queues.find(q => q.name === 'analysis')!.oldestWaiting).toEqual({ etat: 'mesure', plusVieuxMs: 0 })
    })
  })

  /**
   * LA DÉRIVATION SEULE — c'est elle que la file de décision (#1647) consomme,
   * et c'est donc elle qui doit être exhaustivement tenue. Les cas ci-dessus
   * prouvent qu'elle est BRANCHÉE ; ceux-ci prouvent qu'elle est JUSTE.
   */
  describe('ancienneteDuPlusVieuxEnAttente (le contrat de la file de décision #1647)', () => {
    const MAINTENANT = Date.parse('2026-09-07T12:00:00.000Z')

    it('mesure l’âge quand un job en attente existe', () => {
      expect(
        ancienneteDuPlusVieuxEnAttente({
          enAttente: 2,
          ajouteA: MAINTENANT - 61 * 60_000,
          maintenantMs: MAINTENANT,
        }),
      ).toEqual({ etat: 'mesure', plusVieuxMs: 61 * 60_000 })
    })

    it('dit « vide » — et SEULEMENT quand la profondeur lue vaut zéro', () => {
      expect(ancienneteDuPlusVieuxEnAttente({ enAttente: 0, ajouteA: undefined, maintenantMs: MAINTENANT })).toEqual({
        etat: 'vide',
      })
    })

    it('ne conclut pas « vide » d’un silence — profondeur illisible = inconnu', () => {
      expect(
        ancienneteDuPlusVieuxEnAttente({ enAttente: undefined, ajouteA: undefined, maintenantMs: MAINTENANT }),
      ).toEqual({ etat: 'inconnu', raison: 'profondeur-illisible' })
      expect(
        ancienneteDuPlusVieuxEnAttente({ enAttente: Number.NaN, ajouteA: undefined, maintenantMs: MAINTENANT }),
      ).toEqual({ etat: 'inconnu', raison: 'profondeur-illisible' })
    })

    it('la panne COURT-CIRCUITE tout le reste — même une file annoncée vide', () => {
      // Sans le court-circuit, une file injoignable dont les comptes disent 0
      // se déclarerait vide, c'est-à-dire saine. C'est le mensonge à éviter.
      expect(
        ancienneteDuPlusVieuxEnAttente({ enAttente: 0, ajouteA: undefined, maintenantMs: MAINTENANT, panne: true }),
      ).toEqual({ etat: 'inconnu', raison: 'lecture-impossible' })
    })

    it('un horodatage illisible n’est pas un âge de zéro', () => {
      expect(
        ancienneteDuPlusVieuxEnAttente({
          enAttente: 1,
          ajouteA: Number.NaN,
          maintenantMs: MAINTENANT,
        }),
      ).toEqual({ etat: 'inconnu', raison: 'horodatage-illisible' })
    })

    it('borne l’âge à zéro quand l’horloge de la file est en avance', () => {
      expect(
        ancienneteDuPlusVieuxEnAttente({ enAttente: 1, ajouteA: MAINTENANT + 5_000, maintenantMs: MAINTENANT }),
      ).toEqual({ etat: 'mesure', plusVieuxMs: 0 })
    })

    // La règle de #1647, jouée ici SANS coder la file de décision : un job de
    // 61 min est bien MESURÉ, donc la file de décision peut le voir. Le seuil
    // d'une heure, lui, appartient à #1647 — il n'est pas écrit dans ce module.
    it('un job de 61 minutes est MESURÉ — la file de décision (#1647) peut le lire', () => {
      const attente: AdminQueueOldestWaiting = ancienneteDuPlusVieuxEnAttente({
        enAttente: 1,
        ajouteA: MAINTENANT - 61 * 60_000,
        maintenantMs: MAINTENANT,
      })
      expect(attente.etat).toBe('mesure')
      expect(attente.etat === 'mesure' && attente.plusVieuxMs > 60 * 60_000).toBe(true)
    })

    /**
     * AUCUNE RAISON DU VOCABULAIRE N'EST MORTE.
     *
     * Un vocabulaire fermé se périme en silence : on ajoute une raison, on
     * change une branche, et il reste un cas que rien ne produit plus — l'écran
     * porte alors une traduction pour une situation qui n'arrive jamais, et
     * personne ne le sait. Ce test énumère les quatre raisons DÉCLARÉES et
     * exige que la dérivation sache produire chacune.
     */
    it('les quatre raisons déclarées sont toutes ATTEIGNABLES — aucune n’est morte', () => {
      const declarees: AdminQueueUnknownReason[] = [
        'lecture-impossible',
        'comptes-et-file-divergent',
        'horodatage-illisible',
        'profondeur-illisible',
      ]
      const produites = [
        ancienneteDuPlusVieuxEnAttente({ enAttente: 0, ajouteA: null, maintenantMs: MAINTENANT, panne: true }),
        ancienneteDuPlusVieuxEnAttente({ enAttente: 3, ajouteA: null, maintenantMs: MAINTENANT }),
        ancienneteDuPlusVieuxEnAttente({ enAttente: 1, ajouteA: Number.NaN, maintenantMs: MAINTENANT }),
        ancienneteDuPlusVieuxEnAttente({ enAttente: undefined, ajouteA: null, maintenantMs: MAINTENANT }),
      ].map(a => (a.etat === 'inconnu' ? a.raison : null))

      expect(produites).toEqual(declarees)
      // Et le corpus n'est pas vide : une liste vidée rendrait la ligne
      // ci-dessus verte sans avoir rien exercé.
      expect(declarees.length).toBe(4)
    })
  })

  describe('listJobs', () => {
    it('exposes failedReason and the last stack line for a failed job (the incident signal)', async () => {
      const analysis = makeQueueMock({
        getJobs: jest.fn().mockResolvedValue([failedAnalysisJob()]),
        getJobCountByTypes: jest.fn().mockResolvedValue(1),
      })
      const { service } = makeService({ analysis })

      const page = await service.listJobs('analysis', 'failed', 50, 0)

      expect(page.total).toBe(1)
      const job = page.jobs[0]!
      expect(job.id).toBe('job-1')
      expect(job.name).toBe('analyze')
      expect(job.failedReason).toBe('IA service returned 500')
      // "the last stack line" — the deepest frame of the most recent trace.
      expect(job.stackTail).toBe('at AnalysisWorker.run (/app/worker.ts:88:7)')
      expect(job.attemptsMade).toBe(1)
      expect(job.timestamp).toBe(1_700_000_000_000)
      expect(job.processedOn).toBe(1_700_000_001_000)
      expect(job.finishedOn).toBe(1_700_000_002_000)
    })

    it('surfaces only whitelisted debugging fields from job.data — never the profile/context blobs', async () => {
      const analysis = makeQueueMock({
        getJobs: jest.fn().mockResolvedValue([failedAnalysisJob()]),
        getJobCountByTypes: jest.fn().mockResolvedValue(1),
      })
      const { service } = makeService({ analysis })

      const { data } = (await service.listJobs('analysis', 'failed', 50, 0)).jobs[0]!

      expect(data).toEqual({
        accountId: 'acc-123',
        companyName: 'Qonto',
        userId: 'user-9',
        workspaceId: 'ws-1',
        siren: '820123456',
        scopeMode: 'strict',
        country: 'FR',
        correlationId: 'corr-abc',
      })
      expect(data).not.toHaveProperty('profileData')
      expect(data).not.toHaveProperty('userContext')
      expect(data).not.toHaveProperty('accountFeedback')
    })

    it('redacts secret-bearing mailer payloads (otpCode / resetUrl are never surfaced)', async () => {
      const otpJob = {
        id: 'otp-1',
        name: 'send_email_otp',
        data: { emailType: 'otp', to: 'user@acme.io', firstName: 'Ann', otpCode: '123456', expirationMinutes: 10 },
        attemptsMade: 2,
        timestamp: 1_700_000_000_000,
        failedReason: 'SMTP timeout',
        stacktrace: ['Error: SMTP timeout\n    at send (/app/mailer.ts:10:3)'],
      } as unknown as Job
      const mailer = makeQueueMock({
        getJobs: jest.fn().mockResolvedValue([otpJob]),
        getJobCountByTypes: jest.fn().mockResolvedValue(1),
      })
      const { service } = makeService({ mailer })

      const { data, failedReason } = (await service.listJobs('mailer', 'failed', 50, 0)).jobs[0]!

      expect(failedReason).toBe('SMTP timeout')
      expect(data).toEqual({ to: 'user@acme.io', firstName: 'Ann', emailType: 'otp' })
      expect(data).not.toHaveProperty('otpCode')
      expect(data).not.toHaveProperty('resetUrl')
      expect(data).not.toHaveProperty('expirationMinutes')
    })

    it('paginates via getJobs([state], start, end) with limit/offset', async () => {
      const getJobs = jest.fn().mockResolvedValue([])
      const analysis = makeQueueMock({ getJobs, getJobCountByTypes: jest.fn().mockResolvedValue(0) })
      const { service } = makeService({ analysis })

      await service.listJobs('analysis', 'waiting', 25, 50)

      // start = offset (50), end = offset + limit - 1 (74).
      expect(getJobs).toHaveBeenCalledWith(['waiting'], 50, 74)
    })

    it('leaves failedReason/stackTail null for a non-failed job', async () => {
      const waitingJob = {
        id: 'w-1',
        name: 'analyze',
        data: { accountId: 'a', companyName: 'C', userId: 'u' },
        attemptsMade: 0,
        timestamp: 1_700_000_000_000,
      } as unknown as Job
      const analysis = makeQueueMock({
        getJobs: jest.fn().mockResolvedValue([waitingJob]),
        getJobCountByTypes: jest.fn().mockResolvedValue(1),
      })
      const { service } = makeService({ analysis })

      const job = (await service.listJobs('analysis', 'waiting', 50, 0)).jobs[0]!
      expect(job.failedReason).toBeNull()
      expect(job.stackTail).toBeNull()
      expect(job.processedOn).toBeNull()
      expect(job.finishedOn).toBeNull()
    })

    it('rejects an unknown queue name (allowlist) without touching any queue', async () => {
      const { service } = makeService()
      await expect(service.listJobs('secrets', 'failed', 50, 0)).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('retryJob', () => {
    it('retries the failed job on the correct queue', async () => {
      const retry = jest.fn().mockResolvedValue(undefined)
      const job = { id: 'job-1', retry } as unknown as Job
      const getJob = jest.fn().mockResolvedValue(job)
      const analysis = makeQueueMock({ getJob })
      const { service } = makeService({ analysis })

      const res = await service.retryJob('analysis', 'job-1', 'ops@bellum')

      expect(getJob).toHaveBeenCalledWith('job-1')
      expect(retry).toHaveBeenCalledTimes(1)
      expect(res).toEqual({ queue: 'analysis', id: 'job-1', action: 'retry', ok: true })
    })

    it('404s when the job does not exist', async () => {
      const analysis = makeQueueMock({ getJob: jest.fn().mockResolvedValue(null) })
      const { service } = makeService({ analysis })
      await expect(service.retryJob('analysis', 'missing', 'ops')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('rejects an unknown queue name', async () => {
      const { service } = makeService()
      await expect(service.retryJob('secrets', 'job-1', 'ops')).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('removeJob', () => {
    it('removes the job on the correct queue', async () => {
      const remove = jest.fn().mockResolvedValue(undefined)
      const job = { id: 'job-2', remove } as unknown as Job
      const getJob = jest.fn().mockResolvedValue(job)
      const mailer = makeQueueMock({ getJob })
      const { service } = makeService({ mailer })

      const res = await service.removeJob('mailer', 'job-2', 'ops')

      expect(getJob).toHaveBeenCalledWith('job-2')
      expect(remove).toHaveBeenCalledTimes(1)
      expect(res).toEqual({ queue: 'mailer', id: 'job-2', action: 'remove', ok: true })
    })

    it('404s when the job does not exist', async () => {
      const analysis = makeQueueMock({ getJob: jest.fn().mockResolvedValue(null) })
      const { service } = makeService({ analysis })
      await expect(service.removeJob('analysis', 'nope', 'ops')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('cleanState', () => {
    it('bulk-cleans the requested finished state and returns how many were removed', async () => {
      const clean = jest.fn().mockResolvedValue(['a', 'b', 'c'])
      const analysis = makeQueueMock({ clean })
      const { service } = makeService({ analysis })

      const res = await service.cleanState('analysis', 'failed', 'ops')

      // grace 0 (age-agnostic), a sane batch limit, the requested state.
      expect(clean).toHaveBeenCalledWith(0, expect.any(Number), 'failed')
      expect(res).toEqual({ queue: 'analysis', state: 'failed', action: 'clean', removed: 3 })
    })

    it('refuses to bulk-clean a live state (only finished states are cleanable)', async () => {
      const clean = jest.fn()
      const analysis = makeQueueMock({ clean })
      const { service } = makeService({ analysis })

      await expect(service.cleanState('analysis', 'active', 'ops')).rejects.toBeInstanceOf(BadRequestException)
      expect(clean).not.toHaveBeenCalled()
    })

    it('rejects an unknown queue name', async () => {
      const { service } = makeService()
      await expect(service.cleanState('secrets', 'failed', 'ops')).rejects.toBeInstanceOf(BadRequestException)
    })
  })
})
