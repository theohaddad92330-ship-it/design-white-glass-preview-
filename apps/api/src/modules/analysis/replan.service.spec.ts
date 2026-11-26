import type { Queue } from 'bullmq'
import { failure, isFailure, isSuccess, success } from '@bellum/utils'
import type { AnalysisOnDemandService, OnDemandFailure } from './analysis-ondemand.service'
import { ReplanService } from './replan.service'
import { replanJobId, type ReplanJobData, type ReplanJobResult } from './replan.queue'

const USER = '11111111-1111-1111-1111-111111111111'
const ACCOUNT = '22222222-2222-2222-2222-222222222222'

type FakeJob = { id: string; state: string; returnvalue?: ReplanJobResult; remove: jest.Mock }

function makeJob(over: Partial<FakeJob> = {}): FakeJob {
  return { id: replanJobId(ACCOUNT), state: 'waiting', remove: jest.fn(async () => undefined), ...over }
}

function makeQueue(job: FakeJob | null = null) {
  const added: { data: ReplanJobData; opts: { jobId?: string } }[] = []
  return {
    added,
    getJob: jest.fn(async () => (job ? { ...job, getState: async () => job.state } : null)),
    add: jest.fn(async (_name: string, data: ReplanJobData, opts: { jobId?: string }) => {
      added.push({ data, opts })
      return { id: opts.jobId }
    }),
  }
}

type Preflight = Awaited<ReturnType<AnalysisOnDemandService['preflightReplan']>>

function makeOnDemand(preflight: Preflight) {
  return { preflightReplan: jest.fn(async () => preflight) } as unknown as AnalysisOnDemandService
}

const READY: Preflight = success({ ready: true as const })

function build(job: FakeJob | null = null, preflight: Preflight = READY) {
  const queue = makeQueue(job)
  const onDemand = makeOnDemand(preflight)
  return { queue, onDemand, service: new ReplanService(queue as unknown as Queue<ReplanJobData>, onDemand) }
}

/**
 * #1092 — la re-planification durait une à deux minutes contre 120 s tolérées
 * par la passerelle (mesuré en production : 502 à 120 176 ms sur un calcul qui
 * avait pourtant abouti et enregistré son plan). Elle rend donc la main tout de
 * suite et se suit.
 */
describe('ReplanService.enqueue', () => {
  it('refuse SANS mettre en file ce qui se refuse sans calculer', async () => {
    // L'utilisateur apprend immédiatement que son dossier n'a pas de recherche —
    // il n'a pas à attendre un job pour ça.
    const refus: OnDemandFailure = { code: 'precondition_failed', message: 'analyse incomplète' }
    const { service, queue } = build(null, failure(refus))

    const result = await service.enqueue(ACCOUNT, USER)

    expect(isFailure(result) && result.problem.code).toBe('precondition_failed')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('met en file et rend un accusé de réception', async () => {
    const { service, queue } = build()

    const result = await service.enqueue(ACCOUNT, USER, { angle: 'Cybersécurité' })

    expect(isSuccess(result) && result.output).toEqual({ job_id: replanJobId(ACCOUNT), state: 'queued' })
    expect(queue.added[0]?.data).toEqual({ accountId: ACCOUNT, userId: USER, strategy: { angle: 'Cybersécurité' } })
    expect(queue.added[0]?.opts.jobId).toBe(replanJobId(ACCOUNT))
  })

  it('ne lance PAS un second calcul quand un est déjà en vol', async () => {
    // Deux phases 4 concurrentes écriraient le même plan l'une par-dessus
    // l'autre, et coûteraient deux appels modèle pour une seule réponse utile.
    const { service, queue } = build(makeJob({ state: 'active' }))

    const result = await service.enqueue(ACCOUNT, USER)

    expect(isSuccess(result) && result.output.state).toBe('running')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('libère la place d’un job TERMINÉ avant de relancer', async () => {
    // Sans ce retrait, `add()` renverrait silencieusement l'ancien résultat au
    // clic suivant : l'utilisateur croirait avoir re-planifié.
    const fini = makeJob({ state: 'completed' })
    const { service, queue } = build(fini)

    await service.enqueue(ACCOUNT, USER)

    expect(fini.remove).toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalled()
  })

  it('n’envoie pas de clé `strategy` quand rien n’est choisi', async () => {
    const { service, queue } = build()
    await service.enqueue(ACCOUNT, USER)
    expect(Object.keys(queue.added[0]?.data ?? {})).toEqual(['accountId', 'userId'])
  })
})

describe('ReplanService.status', () => {
  it('rend le résultat quand le calcul a abouti', async () => {
    const { service } = build(makeJob({ state: 'completed', returnvalue: { ok: true } }))
    const result = await service.status(ACCOUNT, USER)
    expect(isSuccess(result) && result.output).toEqual({
      state: 'done',
      job_id: replanJobId(ACCOUNT),
      result: { replanned: true },
    })
  })

  it('rejoue un refus MÉTIER comme un échec typé, pas comme un état', async () => {
    // Le client garde ainsi son chemin d'erreur — et ses messages localisés par
    // `code` — exactement comme quand l'appel était synchrone.
    const refus: OnDemandFailure = { code: 'precondition_failed', message: 'analyse incomplète' }
    const { service } = build(makeJob({ state: 'completed', returnvalue: { ok: false, failure: refus } }))

    const result = await service.status(ACCOUNT, USER)

    expect(isFailure(result) && result.problem.code).toBe('precondition_failed')
  })

  it('dit `unknown` quand il ne reste aucune trace du job — jamais « échoué »', async () => {
    // C'est NOTRE réponse qui manque, et le plan a peut-être été enregistré.
    // L'annoncer comme un échec pousserait à relancer, donc à repayer.
    const { service } = build(null)
    const result = await service.status(ACCOUNT, USER)
    expect(isSuccess(result) && result.output.state).toBe('unknown')
  })

  it('ne révèle pas l’état du calcul d’un compte qui n’est pas à l’appelant', async () => {
    const inconnu: OnDemandFailure = { code: 'not_found', message: 'Account not found' }
    const { service } = build(makeJob({ state: 'active' }), failure(inconnu))

    const result = await service.status(ACCOUNT, USER)

    expect(isFailure(result) && result.problem.code).toBe('not_found')
  })

  it('suit un calcul en cours', async () => {
    const { service } = build(makeJob({ state: 'active' }))
    const result = await service.status(ACCOUNT, USER)
    expect(isSuccess(result) && result.output.state).toBe('running')
  })
})
