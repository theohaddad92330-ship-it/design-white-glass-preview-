import { failure, isFailure, success } from '@bellum/utils'
import { ORG_ENRICHMENT_PROMPT_VERSION, ORG_ENRICHMENT_WAVE_SIZE } from '@bellum/contracts'
import { OrgEnrichmentJobService } from './org-enrichment-job.service'
import type { OrgEnrichmentJobEntity } from '../../database/entities/org-enrichment-job.entity'

const ACCOUNT = { id: 'acc-1', workspace_id: 'ws-1' }

/** Un dépôt en mémoire — assez fidèle pour les deux requêtes qu'on fait. */
function fakeRepo() {
  const rows: OrgEnrichmentJobEntity[] = []
  let nextId = 1
  return {
    rows,
    create: jest.fn((data: Partial<OrgEnrichmentJobEntity>) => ({ ...data }) as OrgEnrichmentJobEntity),
    save: jest.fn(async (row: OrgEnrichmentJobEntity) => {
      if (!row.id) {
        row.id = `job-${nextId++}`
        row.created_at = new Date('2026-08-31T08:00:00.000Z')
        row.updated_at = new Date('2026-08-31T08:00:00.000Z')
        rows.push(row)
      }
      return row
    }),
    find: jest.fn(async () => [...rows].reverse()),
    findOne: jest.fn(async ({ where }: { where: { mode: string; status: { _value?: string[] } } }) => {
      const resumable = ['pending', 'running', 'partial', 'failed']
      return rows.find(row => row.mode === where.mode && resumable.includes(row.status)) ?? null
    }),
  }
}

function makeService(opts?: { candidateIds?: string[]; hasCredit?: boolean; runWave?: unknown; account?: unknown }) {
  const repo = fakeRepo()
  const candidateIds = opts?.candidateIds ?? ['c1', 'c2', 'c3']
  const planner = {
    resolveAccount: jest.fn().mockResolvedValue(success(opts?.account ?? ACCOUNT)),
    resolveSelection: jest.fn().mockResolvedValue(
      success({
        account: opts?.account ?? ACCOUNT,
        selection: { scopeLabel: 'Périmètre', candidateIds, contactsTargeted: { status: 'measured', value: 3 } },
      }),
    ),
    hasCredit: jest.fn().mockResolvedValue(opts?.hasCredit ?? true),
    runWave: jest.fn().mockResolvedValue(opts?.runWave ?? success({ matched: 2, creditsDebited: 3 })),
  }
  const service = new OrgEnrichmentJobService(repo as never, planner as never)
  return { service, repo, planner }
}

describe('OrgEnrichmentJobService.advance — création', () => {
  it('écrit un job dont les vagues sont FIGÉES, et lance la première', async () => {
    const { service, repo, planner } = makeService({ candidateIds: ['c1', 'c2', 'c3'] })
    const result = await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 2)
    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return

    expect(repo.rows).toHaveLength(1)
    // 3 candidats, lots de 2 ⇒ deux vagues, la seconde plus petite.
    expect(result.output.job.waves.map(wave => wave.contactIds)).toEqual([['c1', 'c2'], ['c3']])
    expect(result.output.job.waveSize).toBe(2)
    expect(result.output.job.promptVersion).toBe(ORG_ENRICHMENT_PROMPT_VERSION)
    expect(planner.runWave).toHaveBeenCalledWith('acc-1', 'user-1', 'next_batch', ['c1', 'c2'])
  })

  it("le coût ANNONCÉ est figé à la création, le coût RÉEL s'accumule — deux nombres distincts", async () => {
    const { service } = makeService({ candidateIds: ['c1', 'c2'] })
    const result = await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 1)
    if (isFailure(result)) throw new Error('devrait réussir')

    // Deux vagues d'un contact : creditCostOf('targeted_refresh', {1}) = 1 chacune.
    expect(result.output.job.estimatedCredits).toBe(2)
    // Une seule vague a tourné : le réel ne vaut pas encore l'estimé.
    expect(result.output.job.actualCredits).toBe(3)
    expect(result.output.job.estimatedCredits).not.toBe(result.output.job.actualCredits)
  })

  it('une taille de lot absente retombe sur le CTA produit', async () => {
    const { service } = makeService()
    const result = await service.advance('acc-1', 'user-1', { mode: 'next_batch' })
    if (isFailure(result)) throw new Error('devrait réussir')
    expect(result.output.job.waveSize).toBe(ORG_ENRICHMENT_WAVE_SIZE)
  })

  it("un périmètre VIDE refuse plutôt que d'écrire un job sans vague", async () => {
    const { service, repo } = makeService({ candidateIds: [] })
    const result = await service.advance('acc-1', 'user-1', { mode: 'next_batch' })
    expect(isFailure(result)).toBe(true)
    expect(repo.rows).toHaveLength(0)
  })

  it('crédits épuisés : rien n’est écrit, rien n’est lancé', async () => {
    const { service, repo, planner } = makeService({ hasCredit: false })
    const result = await service.advance('acc-1', 'user-1', { mode: 'next_batch' })
    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('insufficient_credits')
    expect(repo.rows).toHaveLength(0)
    expect(planner.runWave).not.toHaveBeenCalled()
  })

  it('un dossier sans espace refuse — un plan appartient à une ESN', async () => {
    const { service } = makeService({ account: { id: 'acc-1', workspace_id: null } })
    const result = await service.advance('acc-1', 'user-1', { mode: 'next_batch' })
    expect(isFailure(result)).toBe(true)
  })
})

/**
 * #2637.1 (21/09/2026, décision Louis) — le rattrapage AUTOMATIQUE des rôles
 * manquants est GRATUIT, aligné sur les six segments de
 * `SegmentCatchupService`. La gratuité se porte sur l'APPEL (`opts.free`),
 * jamais sur le mode ou le service : un appel SANS `opts.free` — le bouton
 * MANUEL, même mode `missing_roles` — continue de vérifier le crédit et de
 * débiter, exactement comme avant ce lot.
 */
describe('OrgEnrichmentJobService.advance — gratuit (#2637.1)', () => {
  it("`opts.free` ignore `hasCredit` : jamais d'échec `insufficient_credits`, même sans crédit", async () => {
    const { service, repo, planner } = makeService({ hasCredit: false, candidateIds: ['c1', 'c2'] })
    const result = await service.advance('acc-1', 'user-1', { mode: 'missing_roles' }, 2, { free: true })
    expect(isFailure(result)).toBe(false)
    expect(planner.hasCredit).not.toHaveBeenCalled()
    expect(repo.rows).toHaveLength(1)
  })

  it('`opts.free` fait porter `true` jusqu’au planificateur — le chemin gratuit est bien celui emprunté', async () => {
    const { service, planner } = makeService({ candidateIds: ['c1', 'c2'] })
    await service.advance('acc-1', 'user-1', { mode: 'missing_roles' }, 2, { free: true })
    expect(planner.runWave).toHaveBeenCalledWith('acc-1', 'user-1', 'missing_roles', ['c1', 'c2'], true)
  })

  it('sans `opts` (appel MANUEL), `hasCredit` est toujours vérifié et `runWave` reçoit ses quatre arguments habituels', async () => {
    const { service, planner } = makeService({ candidateIds: ['c1', 'c2'] })
    await service.advance('acc-1', 'user-1', { mode: 'missing_roles' }, 2)
    expect(planner.hasCredit).toHaveBeenCalledWith('user-1')
    expect(planner.runWave).toHaveBeenCalledWith('acc-1', 'user-1', 'missing_roles', ['c1', 'c2'])
  })
})

describe('OrgEnrichmentJobService.advance — reprise', () => {
  it('rappeler la même porte REPREND le job, il n’en crée pas un second', async () => {
    const { service, repo } = makeService({ candidateIds: ['c1', 'c2', 'c3', 'c4'] })
    await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 2)
    const second = await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 2)
    if (isFailure(second)) throw new Error('devrait réussir')

    expect(repo.rows).toHaveLength(1)
    expect(second.output.ranWave?.index).toBe(1)
    expect(second.output.job.status).toBe('completed')
  })

  it('une vague qui TOMBE laisse le job reprenable, et la reprise repart de la suivante', async () => {
    const { service, planner, repo } = makeService({ candidateIds: ['c1', 'c2'] })
    planner.runWave.mockResolvedValueOnce(failure({ code: 'ia_failed', message: 'le modèle a coupé' }))

    const first = await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 1)
    expect(isFailure(first)).toBe(true)
    // Le job existe, il porte l'échec, et il n'est PAS marqué terminé.
    expect(repo.rows[0]?.status).toBe('running')
    expect(repo.rows[0]?.waves[0]?.status).toBe('failed')
    expect(repo.rows[0]?.waves[0]?.error).toBe('le modèle a coupé')
    // Rien n'a été débité pour une vague qui n'a pas tourné.
    expect(repo.rows[0]?.waves[0]?.actualCredits).toBeNull()

    // La reprise avance sur la vague NEUVE avant de rejouer celle qui est tombée.
    const second = await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 1)
    if (isFailure(second)) throw new Error('devrait réussir')
    expect(second.output.ranWave?.index).toBe(1)
    expect(second.output.job.status).toBe('partial')
    // Le total ne compte QUE la vague mesurée : l'échec n'est pas un zéro.
    expect(second.output.job.actualCredits).toBe(3)
  })

  it('un job entièrement terminé ne relance rien et ne débite rien', async () => {
    const { service, planner } = makeService({ candidateIds: ['c1'] })
    await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 1)
    planner.runWave.mockClear()

    // Le job est `completed` : `findResumable` ne le rend plus, donc un second
    // appel recrée un job… sur un périmètre que la sélection dit toujours plein.
    // Ce que ce test fixe, c'est qu'aucune vague déjà faite n'est rejouée.
    const second = await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 1)
    if (isFailure(second)) throw new Error('devrait réussir')
    expect(second.output.job.waves.filter(wave => wave.status === 'done')).toHaveLength(1)
  })

  it('deux MODES différents sont deux jobs — ils ne se reprennent pas l’un l’autre', async () => {
    const { service, repo } = makeService({ candidateIds: ['c1', 'c2'] })
    await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 1)
    await service.advance('acc-1', 'user-1', { mode: 'missing_roles' }, 1)
    expect(repo.rows).toHaveLength(2)
    expect(repo.rows.map(row => row.mode)).toEqual(['next_batch', 'missing_roles'])
  })
})

describe('OrgEnrichmentJobService.list', () => {
  it('rend l’historique du compte, le plus récent d’abord', async () => {
    const { service } = makeService({ candidateIds: ['c1'] })
    await service.advance('acc-1', 'user-1', { mode: 'next_batch' }, 1)
    const listed = await service.list('acc-1', 'user-1')
    if (isFailure(listed)) throw new Error('devrait réussir')
    expect(listed.output).toHaveLength(1)
    expect(listed.output[0]?.accountId).toBe('acc-1')
  })

  it('un compte hors de portée ne rend aucun job', async () => {
    const { service, planner } = makeService()
    planner.resolveAccount.mockResolvedValue(failure({ code: 'not_found', message: 'nope' }))
    const listed = await service.list('acc-x', 'user-1')
    expect(isFailure(listed)).toBe(true)
  })
})
