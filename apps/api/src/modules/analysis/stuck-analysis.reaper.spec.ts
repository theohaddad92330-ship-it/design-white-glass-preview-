import { type Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ANALYSIS_INTERRUPTED_MESSAGE } from '../accounts/accounts.service'
import { CreditsService } from '../credits/credits.service'
import { AnalysisRunsService } from './analysis-runs.service'
import { JOB_TIMEOUT_MS } from './analysis.constants'
import { StuckAnalysisReaper } from './stuck-analysis.reaper'

const NOW = 1_700_000_000_000

function account(overrides: Partial<AccountEntity> = {}): AccountEntity {
  return {
    id: 'acct-1',
    user_id: 'user-1',
    status: 'analyzing',
    updated_at: new Date(NOW - JOB_TIMEOUT_MS - 60_000),
    ...overrides,
  } as unknown as AccountEntity
}

type Job = { data: { accountId?: string }; processedOn?: number | null }

function setup(candidates: AccountEntity[], liveJobs: Job[], updateAffected = 1) {
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(candidates),
  }
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    update: jest.fn().mockResolvedValue({ affected: updateAffected }),
  } as unknown as Repository<AccountEntity>
  const queue = {
    getJobs: jest.fn().mockResolvedValue(liveJobs),
  } as unknown as Queue
  const runs = {
    completeLatest: jest.fn().mockResolvedValue(undefined),
    reconcileStaleRuns: jest.fn().mockResolvedValue({ reconciled: 0, failed: 0 }),
  } as unknown as AnalysisRunsService
  const credits = { refundAnalysisSlot: jest.fn().mockResolvedValue(undefined) } as unknown as CreditsService
  const reaper = new StuckAnalysisReaper(queue, repo, runs, credits)
  return { reaper, repo, queue, runs, credits, builder }
}

describe('StuckAnalysisReaper', () => {
  it('flips a stuck analyzing account (no live job, past ceiling) to error + mirrors run history', async () => {
    const { reaper, repo, runs } = setup([account({ id: 'a1' })], [])

    const result = await reaper.reap(NOW)

    expect(result).toEqual({ reaped: 1, reconciled: 0 })
    expect(repo.update as jest.Mock).toHaveBeenCalledWith(
      { id: 'a1', status: 'analyzing' },
      { status: 'error', error_message: ANALYSIS_INTERRUPTED_MESSAGE },
    )
    expect(runs.completeLatest as jest.Mock).toHaveBeenCalledWith('a1', { status: 'error' })
  })

  it('leaves an account that still has a live BullMQ job untouched', async () => {
    const { reaper, repo, runs } = setup([account({ id: 'a1' })], [{ data: { accountId: 'a1' } }])

    const result = await reaper.reap(NOW)

    expect(result).toEqual({ reaped: 0, reconciled: 0 })
    expect(repo.update as jest.Mock).not.toHaveBeenCalled()
    expect(runs.completeLatest as jest.Mock).not.toHaveBeenCalled()
  })

  // 03/11/2026 : la file est désormais lue MÊME sans compte bloqué. Le balayage des runs
  // orphelins (`reconcileStaleRuns`) a besoin de l'ensemble des comptes qui portent un job
  // vivant pour savoir lesquels épargner, et cet ensemble ne peut venir que de la file.
  // Ce qui reste garanti — et ce que ce test défend — c'est qu'on n'ÉCRIT rien.
  it('n’écrit rien quand aucun candidat n’est périmé (mais lit la file)', async () => {
    const { reaper, repo, runs, queue } = setup([], [])

    const result = await reaper.reap(NOW)

    expect(result).toEqual({ reaped: 0, reconciled: 0 })
    expect(queue.getJobs as jest.Mock).toHaveBeenCalledTimes(1)
    expect(repo.update as jest.Mock).not.toHaveBeenCalled()
    expect(runs.completeLatest as jest.Mock).not.toHaveBeenCalled()
    expect(runs.reconcileStaleRuns as jest.Mock).toHaveBeenCalledWith(expect.any(Date), [], expect.any(Number))
  })

  it('queries only `analyzing` rows older than the job ceiling', async () => {
    const { reaper, builder } = setup([], [])

    await reaper.reap(NOW)

    expect(builder.where).toHaveBeenCalledWith('account.status = :status', { status: 'analyzing' })
    const [, params] = (builder.andWhere as jest.Mock).mock.calls[0]
    expect((params.cutoff as Date).getTime()).toBe(NOW - JOB_TIMEOUT_MS)
  })

  it('does not mirror run history when the guarded update affected 0 rows (raced with the worker)', async () => {
    const { reaper, runs } = setup([account({ id: 'a1' })], [], /* updateAffected */ 0)

    const result = await reaper.reap(NOW)

    expect(result).toEqual({ reaped: 0, reconciled: 0 })
    expect(runs.completeLatest as jest.Mock).not.toHaveBeenCalled()
  })

  describe('dossier complet resté bloqué en `analyzing`', () => {
    // Séquelle du bug de saut de phase 4 : le plan et le compte sont écrits par
    // deux chemins différents. Un compte peut donc porter un dossier COMPLET
    // tout en restant `analyzing`. Le passer en `error` détruirait un dossier
    // parfaitement valide — c'est un compte à réconcilier, pas à faucher.
    // ``raw_analysis`` est typé côté entité comme le blob de recherche seul : il
    // ne modélise pas le `plan` que la phase 4 y fusionne pourtant. D'où le cast.
    const raw = (value: unknown): AccountEntity['raw_analysis'] => value as AccountEntity['raw_analysis']
    const completeDossier = raw({ plan: { actionPlan: { strategy: 'Bottom-up' } } })

    it('le passe en `completed` plutôt qu’en `error`', async () => {
      const { reaper, repo, runs } = setup([account({ id: 'a1', raw_analysis: completeDossier })], [])

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 0, reconciled: 1 })
      expect(repo.update as jest.Mock).toHaveBeenCalledWith(
        { id: 'a1', status: 'analyzing' },
        { status: 'completed', error_message: null },
      )
      expect(runs.completeLatest as jest.Mock).toHaveBeenCalledWith('a1', { status: 'completed' })
    })

    it('fauche toujours celui dont le dossier est vraiment vide', async () => {
      const { reaper, repo } = setup([account({ id: 'a1', raw_analysis: raw({ research: {} }) })], [])

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 1, reconciled: 0 })
      expect(repo.update as jest.Mock).toHaveBeenCalledWith(
        { id: 'a1', status: 'analyzing' },
        { status: 'error', error_message: ANALYSIS_INTERRUPTED_MESSAGE },
      )
    })

    it('trie un lot mixte compte par compte', async () => {
      const { reaper, repo } = setup(
        [
          account({ id: 'a1', raw_analysis: completeDossier }),
          account({ id: 'a2', raw_analysis: raw(null) }),
          account({ id: 'a3', raw_analysis: completeDossier }),
        ],
        [],
      )

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 1, reconciled: 2 })
      const statuses = (repo.update as jest.Mock).mock.calls.map(([where, set]) => [where.id, set.status])
      expect(statuses).toEqual([
        ['a1', 'completed'],
        ['a2', 'error'],
        ['a3', 'completed'],
      ])
    })

    it('respecte le job vivant : un dossier complet en cours de run n’est pas touché', async () => {
      const { reaper, repo } = setup(
        [account({ id: 'a1', raw_analysis: completeDossier })],
        [{ data: { accountId: 'a1' } }],
      )

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 0, reconciled: 0 })
      expect(repo.update as jest.Mock).not.toHaveBeenCalled()
    })
  })

  describe('remboursement du crédit d’analyse (run interrompu)', () => {
    // Le worker rembourse le slot sur échec terminal (`analysis.worker.ts`), mais
    // le faucheur existe PRÉCISÉMENT pour les runs dont le worker n'a JAMAIS émis
    // son événement terminal (éviction Redis, redeploy Railway en plein run).
    // Donc dans le seul cas où le worker ne peut pas rembourser, personne ne
    // remboursait : l'utilisateur payait 1 crédit pour un dossier vide.
    // Règle Théo §7 : « rembourser si échec non utilisateur ».
    it('rembourse le slot du propriétaire quand il fauche un run interrompu', async () => {
      const { reaper, credits } = setup([account({ id: 'a1', user_id: 'owner-1' })], [])

      await reaper.reap(NOW)

      expect(credits.refundAnalysisSlot as jest.Mock).toHaveBeenCalledWith('owner-1', {
        reason: expect.stringContaining('interrompu'),
        accountId: 'a1',
      })
    })

    it('ne rembourse PAS un dossier réconcilié en `completed` (le dossier est livré)', async () => {
      const complete = { plan: { actionPlan: { strategy: 'Bottom-up' } } } as unknown as AccountEntity['raw_analysis']
      const { reaper, credits } = setup([account({ id: 'a1', raw_analysis: complete })], [])

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 0, reconciled: 1 })
      expect(credits.refundAnalysisSlot as jest.Mock).not.toHaveBeenCalled()
    })

    // La transition est gardée sur `status='analyzing'` : si le worker (ou la
    // réparation à la lecture) a déjà basculé la ligne, on n'a PAS gagné la
    // transition — et l'autre chemin a déjà remboursé. Rembourser ici doublerait.
    it('ne rembourse pas quand la transition gardée a perdu la course (affected = 0)', async () => {
      const { reaper, credits } = setup([account({ id: 'a1' })], [], /* updateAffected */ 0)

      await reaper.reap(NOW)

      expect(credits.refundAnalysisSlot as jest.Mock).not.toHaveBeenCalled()
    })

    it('rembourse chaque compte fauché d’un lot, une seule fois par compte', async () => {
      const { reaper, credits } = setup(
        [account({ id: 'a1', user_id: 'owner-1' }), account({ id: 'a2', user_id: 'owner-2' })],
        [],
      )

      await reaper.reap(NOW)

      expect((credits.refundAnalysisSlot as jest.Mock).mock.calls.map(([uid, ctx]) => [uid, ctx.accountId])).toEqual([
        ['owner-1', 'a1'],
        ['owner-2', 'a2'],
      ])
    })

    // Best-effort : un remboursement qui échoue ne doit jamais empêcher le
    // faucheur de débloquer les autres dossiers fantômes (le vrai bug de Théo).
    it('poursuit le balayage si le remboursement échoue', async () => {
      const { reaper, credits } = setup([account({ id: 'a1' }), account({ id: 'a2' })], [])
      ;(credits.refundAnalysisSlot as jest.Mock).mockRejectedValueOnce(new Error('billing down'))

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 2, reconciled: 0 })
    })

    // COMPOSITION #627 × D2 — le cas qui compte vraiment.
    // #627 rend le run mort ATTEIGNABLE (un job `active` orphelin ne compte plus
    // comme vivant) ; ce correctif rend la sortie REMBOURSÉE. Avant la
    // combinaison des deux, ce compte précis — worker tué en plein run, le mode
    // de panne le plus courant en prod (redeploy Railway) — n'était jamais
    // fauché DU TOUT, donc jamais remboursé : le crédit était perdu pour
    // toujours, en silence.
    it('rembourse un run dont le worker est mort en tenant le job (le cas #627)', async () => {
      const { reaper, credits } = setup(
        [account({ id: 'a1', user_id: 'owner-1' })],
        [{ data: { accountId: 'a1' }, processedOn: NOW - JOB_TIMEOUT_MS - 1 }],
      )

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 1, reconciled: 0 })
      expect(credits.refundAnalysisSlot as jest.Mock).toHaveBeenCalledWith('owner-1', {
        reason: expect.stringContaining('interrompu'),
        accountId: 'a1',
      })
    })

    // Le pendant : un job orphelin dont le dossier est COMPLET est réconcilié en
    // `completed`, donc toujours pas remboursé — le dossier est livré.
    it('ne rembourse pas un job orphelin dont le dossier est complet', async () => {
      const complete = { plan: { actionPlan: { strategy: 'Bottom-up' } } } as unknown as AccountEntity['raw_analysis']
      const { reaper, credits } = setup(
        [account({ id: 'a1', raw_analysis: complete })],
        [{ data: { accountId: 'a1' }, processedOn: NOW - JOB_TIMEOUT_MS - 1 }],
      )

      expect(await reaper.reap(NOW)).toEqual({ reaped: 0, reconciled: 1 })
      expect(credits.refundAnalysisSlot as jest.Mock).not.toHaveBeenCalled()
    })

    // Un run légitimement long ne doit être ni fauché ni remboursé : le worker
    // est vivant et rendra son crédit lui-même s'il échoue.
    it('ne rembourse pas un run encore dans son budget', async () => {
      const { reaper, credits } = setup(
        [account({ id: 'a1' })],
        [{ data: { accountId: 'a1' }, processedOn: NOW - JOB_TIMEOUT_MS + 60_000 }],
      )

      await reaper.reap(NOW)

      expect(credits.refundAnalysisSlot as jest.Mock).not.toHaveBeenCalled()
    })
  })

  describe('job `active` orphelin — le worker est mort en tenant le job', () => {
    // C'est le trou qui rendait un compte bloqué DÉFINITIVEMENT : quand le
    // process worker disparaît (redeploy Railway, OOM, kill) en cours de job,
    // plus personne n'exécute le stalled-check de BullMQ, donc le job reste
    // `active` dans Redis pour toujours. Le faucheur le lisait comme « job
    // vivant » et passait son chemin à CHAQUE tick — le seul scénario de mort du
    // worker que le faucheur existe pour rattraper était précisément celui qu'il
    // refusait de toucher. `processedOn` date la prise en charge par le worker :
    // passé le plafond du job, aucun événement terminal ne peut plus arriver.

    it('fauche un compte dont le job `active` a dépassé le plafond (worker disparu)', async () => {
      const { reaper, repo } = setup(
        [account({ id: 'a1' })],
        [{ data: { accountId: 'a1' }, processedOn: NOW - JOB_TIMEOUT_MS - 1 }],
      )

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 1, reconciled: 0 })
      expect(repo.update as jest.Mock).toHaveBeenCalledWith(
        { id: 'a1', status: 'analyzing' },
        { status: 'error', error_message: ANALYSIS_INTERRUPTED_MESSAGE },
      )
    })

    it('épargne un job `active` encore DANS son budget (run légitimement long)', async () => {
      const { reaper, repo } = setup(
        [account({ id: 'a1' })],
        [{ data: { accountId: 'a1' }, processedOn: NOW - JOB_TIMEOUT_MS + 60_000 }],
      )

      expect(await reaper.reap(NOW)).toEqual({ reaped: 0, reconciled: 0 })
      expect(repo.update as jest.Mock).not.toHaveBeenCalled()
    })

    it('épargne un job en attente (jamais démarré : pas de `processedOn`)', async () => {
      const { reaper, repo } = setup([account({ id: 'a1' })], [{ data: { accountId: 'a1' }, processedOn: null }])

      expect(await reaper.reap(NOW)).toEqual({ reaped: 0, reconciled: 0 })
      expect(repo.update as jest.Mock).not.toHaveBeenCalled()
    })
  })

  it('reaps only the accounts without a live job in a mixed batch', async () => {
    const { reaper, repo } = setup(
      [account({ id: 'a1' }), account({ id: 'a2' }), account({ id: 'a3' })],
      [{ data: { accountId: 'a2' } }],
    )

    const result = await reaper.reap(NOW)

    expect(result).toEqual({ reaped: 2, reconciled: 0 })
    const updatedIds = (repo.update as jest.Mock).mock.calls.map(([where]) => where.id)
    expect(updatedIds).toEqual(['a1', 'a3'])
  })

  /**
   * ───────────────────────────────────────────────────────────────────────
   * LES RUNS, PAS SEULEMENT LES COMPTES — mesuré le 03/11/2026
   * ───────────────────────────────────────────────────────────────────────
   * L'alerte `job_bloque` compte des lignes d'`analysis_runs` ; ce faucheur ne
   * lisait que `accounts`. Un run qui n'est plus le dernier de son compte, ou
   * dont le compte a déjà été passé terminal ailleurs (redémarrage de conteneur
   * en plein run), n'était fermé par personne : « 10 analyses encore en cours,
   * la plus ancienne date de 205 min », toutes les heures, pendant que le
   * faucheur tournait et ne trouvait rien — il regardait l'autre table.
   */
  describe('balayage des runs orphelins', () => {
    it('balaie les runs périmés MÊME quand aucun compte n’est bloqué', async () => {
      const { reaper, runs } = setup([], [])

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 0, reconciled: 0 })
      expect(runs.reconcileStaleRuns as jest.Mock).toHaveBeenCalledWith(
        new Date(NOW - JOB_TIMEOUT_MS),
        [],
        expect.any(Number),
      )
    })

    it('ne ferme jamais un run dont le compte porte un job VIVANT', async () => {
      const { reaper, runs } = setup([account({ id: 'a1' })], [{ data: { accountId: 'a2' } }])

      await reaper.reap(NOW)

      const [, live] = (runs.reconcileStaleRuns as jest.Mock).mock.calls[0]
      expect(live).toEqual(['a2'])
    })

    it('ignore un job en vol périmé — il ne protège plus ses runs', async () => {
      const { reaper, runs } = setup(
        [account({ id: 'a1' })],
        [{ data: { accountId: 'a2' }, processedOn: NOW - JOB_TIMEOUT_MS - 1 }],
      )

      await reaper.reap(NOW)

      const [, live] = (runs.reconcileStaleRuns as jest.Mock).mock.calls[0]
      expect(live).toEqual([])
    })

    it('un échec du balayage des runs ne casse pas le fauchage des comptes', async () => {
      const { reaper, repo, runs } = setup([account({ id: 'a1' })], [])
      ;(runs.reconcileStaleRuns as jest.Mock).mockRejectedValueOnce(new Error('boom'))

      const result = await reaper.reap(NOW)

      expect(result).toEqual({ reaped: 1, reconciled: 0 })
      expect(repo.update as jest.Mock).toHaveBeenCalled()
    })
  })
})
