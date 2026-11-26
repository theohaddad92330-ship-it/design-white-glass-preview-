import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { AUTO_NEED_MATCH_DAILY_CAP } from '@bellum/contracts'
import type { NeedAutoMatchEntity } from '../../../database/entities/need-auto-match.entity'
import { AutoNeedMatchingService, type ArrivedNeed } from './auto-need-matching.service'
import { AUTO_NEED_MATCH_JOB, autoNeedMatchJobId, type AutoNeedMatchJobData } from './auto-need-matching.queue'
import type { MatchingService } from './matching.service'

const WORKSPACE = 'a0000000-0000-4000-8000-000000000001'
const ACTIVATOR = 'b0000000-0000-4000-8000-000000000001'
const NEED = 'c0000000-0000-4000-8000-000000000001'
const RUN = 'd0000000-0000-4000-8000-000000000001'

const NEED_WITH_SKILLS: ArrivedNeed = {
  id: NEED,
  workspace_id: WORKSPACE,
  owner_id: null,
  skills: [{ term: 'Kubernetes', required: true } as never],
  seniority: null,
  location: null,
  remote: null,
  start_on: null,
}

/**
 * Une base EN MÉMOIRE réduite à ce que le service lit et écrit : la table
 * `need_auto_matches` (clé = besoin), l'activateur de la routine et le compte
 * du jour. Le test n'exerce pas Postgres — il exerce les DÉCISIONS.
 */
function makeHarness(options: { activator?: string | null; launchedToday?: number } = {}) {
  const rows = new Map<string, { status: string; run_id: string | null; user_id: string }>()
  const sql: string[] = []
  const query = jest.fn(async (text: string, params: unknown[] = []) => {
    sql.push(text)
    if (text.includes('FROM routine_subscriptions')) {
      const activator = options.activator === undefined ? ACTIVATOR : options.activator
      return activator ? [{ user_id: activator }] : []
    }
    if (text.includes('count(*)')) return [{ count: String(options.launchedToday ?? 0) }]
    if (text.startsWith('INSERT INTO need_auto_matches')) {
      const [needId, , userId, status] = params as string[]
      if (rows.has(needId as string)) return []
      rows.set(needId as string, { status: status as string, run_id: null, user_id: userId as string })
      return [{ need_id: needId }]
    }
    if (text.startsWith('SELECT status, user_id FROM need_auto_matches')) {
      const row = rows.get(params[0] as string)
      return row ? [{ status: row.status, user_id: row.user_id }] : []
    }
    if (text.startsWith('UPDATE need_auto_matches')) {
      const [needId, , status, runId, onlyFrom] = params as (string | null)[]
      const row = rows.get(needId as string)
      if (row && row.status === onlyFrom) {
        row.status = status as string
        row.run_id = runId ?? row.run_id
      }
      return []
    }
    throw new Error(`requête inattendue : ${text}`)
  })
  const repo = { manager: { query } } as unknown as Repository<NeedAutoMatchEntity>
  const queue = { add: jest.fn(async () => undefined) } as unknown as Queue<AutoNeedMatchJobData> & {
    add: jest.Mock
  }
  const matchNeed = jest.fn()
  const matching = { matchNeed } as unknown as MatchingService
  const service = new AutoNeedMatchingService(repo, queue, matching)
  return { service, rows, queue, matchNeed, sql }
}

describe('AutoNeedMatchingService.onNeedCreated — l’arrivée d’un besoin (c93)', () => {
  it('routine ACTIVE : une ligne `queued`, un job attribué à l’activateur, identifié par le besoin', async () => {
    const { service, rows, queue } = makeHarness()
    await expect(service.onNeedCreated(NEED_WITH_SKILLS)).resolves.toBe('queued')
    expect(rows.get(NEED)).toEqual({ status: 'queued', run_id: null, user_id: ACTIVATOR })
    expect(queue.add).toHaveBeenCalledWith(
      AUTO_NEED_MATCH_JOB,
      { needId: NEED, workspaceId: WORKSPACE, userId: ACTIVATOR },
      expect.objectContaining({ jobId: autoNeedMatchJobId(NEED) }),
    )
  })

  it('routine INACTIVE dans l’espace : rien n’est écrit, rien n’est mis en file', async () => {
    const { service, rows, queue } = makeHarness({ activator: null })
    await expect(service.onNeedCreated(NEED_WITH_SKILLS)).resolves.toBeNull()
    expect(rows.size).toBe(0)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('IDEMPOTENT — le même besoin arrivé deux fois ne produit qu’une ligne et qu’un job', async () => {
    const { service, rows, queue } = makeHarness()
    await service.onNeedCreated(NEED_WITH_SKILLS)
    await expect(service.onNeedCreated(NEED_WITH_SKILLS)).resolves.toBeNull()
    expect(rows.size).toBe(1)
    expect(queue.add).toHaveBeenCalledTimes(1)
  })

  it('plafond quotidien atteint : `capped`, AUCUN job', async () => {
    const { service, rows, queue } = makeHarness({ launchedToday: AUTO_NEED_MATCH_DAILY_CAP })
    await expect(service.onNeedCreated(NEED_WITH_SKILLS)).resolves.toBe('capped')
    expect(rows.get(NEED)?.status).toBe('capped')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('aucune compétence : `no_criteria`, AUCUN job — même règle que le bouton', async () => {
    const { service, rows, queue } = makeHarness()
    await expect(service.onNeedCreated({ ...NEED_WITH_SKILLS, skills: [] })).resolves.toBe('no_criteria')
    expect(rows.get(NEED)?.status).toBe('no_criteria')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('une insertion sans la colonne `skills` (import de fichier) se lit « aucune compétence », jamais une panne', async () => {
    const { service, rows } = makeHarness()
    const fromImport = { ...NEED_WITH_SKILLS, skills: undefined } as unknown as ArrivedNeed
    await expect(service.onNeedCreated(fromImport)).resolves.toBe('no_criteria')
    expect(rows.get(NEED)?.status).toBe('no_criteria')
  })

  it('un besoin sans espace n’est jamais pris (aucune routine d’espace ne le couvre)', async () => {
    const { service, queue } = makeHarness()
    await expect(service.onNeedCreated({ ...NEED_WITH_SKILLS, workspace_id: null })).resolves.toBeNull()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('ne lève JAMAIS : une file indisponible marque `failed`, la création du besoin n’est pas touchée', async () => {
    const { service, rows, queue } = makeHarness()
    queue.add.mockRejectedValueOnce(new Error('redis_down'))
    await expect(service.onNeedCreated(NEED_WITH_SKILLS)).resolves.toBe('failed')
    expect(rows.get(NEED)?.status).toBe('failed')
  })

  it('le propriétaire du besoin est préféré comme auteur quand il a lui-même activé la routine', async () => {
    const { service, sql } = makeHarness()
    await service.onNeedCreated({ ...NEED_WITH_SKILLS, owner_id: ACTIVATOR })
    expect(sql.find(text => text.includes('FROM routine_subscriptions'))).toMatch(
      /ORDER BY COALESCE\(rs\.user_id = \$2/,
    )
  })
})

describe('AutoNeedMatchingService.process — le travail du job', () => {
  const job: AutoNeedMatchJobData = { needId: NEED, workspaceId: WORKSPACE, userId: ACTIVATOR }

  it('écrit le run par le MÊME chemin que le matching manuel, et le rattache', async () => {
    const { service, rows, matchNeed } = makeHarness()
    await service.onNeedCreated(NEED_WITH_SKILLS)
    matchNeed.mockResolvedValue({ runId: RUN, recommended: [] })
    await expect(service.process(job)).resolves.toBe('done')
    // Aucune lecture financière pour un run que personne n'a demandé.
    expect(matchNeed).toHaveBeenCalledWith(NEED, WORKSPACE, ACTIVATOR, { canReadFinance: false })
    expect(rows.get(NEED)).toMatchObject({ status: 'done', run_id: RUN })
  })

  it('une tentative de plus (BullMQ) sur un besoin déjà traité ne réécrit RIEN', async () => {
    const { service, matchNeed } = makeHarness()
    await service.onNeedCreated(NEED_WITH_SKILLS)
    matchNeed.mockResolvedValue({ runId: RUN, recommended: [] })
    await service.process(job)
    await expect(service.process(job)).resolves.toBe('done')
    expect(matchNeed).toHaveBeenCalledTimes(1)
  })

  it('UN TIMEOUT N’EST PAS UN ÉCHEC — `unknown`, pas d’exception (donc pas de reprise)', async () => {
    jest.useFakeTimers()
    try {
      const { service, rows, matchNeed } = makeHarness()
      await service.onNeedCreated(NEED_WITH_SKILLS)
      let finish: (value: unknown) => void = () => undefined
      matchNeed.mockReturnValue(new Promise(resolve => (finish = resolve)))
      const pending = service.process(job, 1_000)
      await jest.advanceTimersByTimeAsync(1_001)
      await expect(pending).resolves.toBe('unknown')
      expect(rows.get(NEED)?.status).toBe('unknown')

      // L'issue tardive REMPLACE l'inconnu : le run a fini par s'écrire.
      finish({ runId: RUN, recommended: [] })
      await jest.advanceTimersByTimeAsync(0)
      expect(rows.get(NEED)).toMatchObject({ status: 'done', run_id: RUN })
    } finally {
      jest.useRealTimers()
    }
  })

  it('besoin disparu entre l’arrivée et le job : `failed`, sans exception', async () => {
    const { service, rows, matchNeed } = makeHarness()
    await service.onNeedCreated(NEED_WITH_SKILLS)
    matchNeed.mockResolvedValue(null)
    await expect(service.process(job)).resolves.toBe('failed')
    expect(rows.get(NEED)?.status).toBe('failed')
  })

  it('une vraie erreur REMONTE (BullMQ réessaie), puis `markFailed` la nomme', async () => {
    const { service, rows, matchNeed } = makeHarness()
    await service.onNeedCreated(NEED_WITH_SKILLS)
    matchNeed.mockRejectedValue(new Error('db_gone'))
    await expect(service.process(job)).rejects.toThrow('db_gone')
    expect(rows.get(NEED)?.status).toBe('queued')
    await service.markFailed(job)
    expect(rows.get(NEED)?.status).toBe('failed')
  })
})
