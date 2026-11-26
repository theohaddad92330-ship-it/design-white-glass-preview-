import { failure, success } from '@bellum/utils'
import type { AnalysisBatchEntity } from '../../database/entities/analysis-batch.entity'
import type { AnalysisBatchItemEntity } from '../../database/entities/analysis-batch-item.entity'
import { AnalysisBatchesService, type AnalysisBatchPorts } from './analysis-batches.service'

/** Les tests appellent le service comme le contrôleur : les ports de l'espace `ws-1` déjà résolus. */
function bind(service: AnalysisBatchesService, ports: AnalysisBatchPorts) {
  return {
    preview: (userId: string, body: Parameters<AnalysisBatchesService['preview']>[2]) =>
      service.preview(ports, userId, body),
    create: (userId: string, body: Parameters<AnalysisBatchesService['create']>[2]) =>
      service.create(ports, userId, body),
    get: (userId: string, id: string) => service.get(ports, userId, id),
    list: (userId: string) => service.list(ports.workspaceId, undefined, { ports, userId }),
    cancel: (userId: string, id: string) => service.cancel(ports, userId, id),
    retry: (userId: string, id: string) => service.retry(ports, userId, id),
    confirm: (userId: string, id: string, itemId: string, siren: string) =>
      service.confirm(ports, userId, id, itemId, siren),
    exclude: (userId: string, id: string, itemId: string) => service.exclude(ports, userId, id, itemId),
  }
}

/* Un dépôt en mémoire, juste assez pour `save` / `findOne` / `find`. */
function memoryRepo<T extends { id: string }>() {
  const rows: T[] = []
  let seq = 0
  return {
    rows,
    create: (value: Partial<T>) => ({ ...value }) as T,
    save: jest.fn(async (value: T | T[]) => {
      const list = Array.isArray(value) ? value : [value]
      for (const row of list) {
        if (!row.id) (row as { id: string }).id = `id-${++seq}`
        const index = rows.findIndex(existing => existing.id === row.id)
        if (index >= 0) rows[index] = row
        else rows.push(row)
      }
      return value
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<T> }) => {
      return (
        rows.find(row => Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v)) ?? null
      )
    }),
    find: jest.fn(async ({ where }: { where: Partial<T> }) =>
      rows.filter(row => Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v)),
    ),
  }
}

function build(opts: { demo?: boolean } = {}) {
  const batches = memoryRepo<AnalysisBatchEntity>()
  const items = memoryRepo<AnalysisBatchItemEntity>()
  const analysis = {
    planLaunch: jest.fn(async (params: { companyName: string; siren?: string }) => {
      if (opts.demo) return { scenario: 'demo' as const }
      if (params.companyName === 'Engie')
        return { scenario: 'cache_hit' as const, accountId: 'acc-engie', companyName: 'Engie' }
      return { scenario: 'fresh' as const, credits: 8, publicTenderSources: [] }
    }),
    start: jest.fn(async (dto: { company_name: string }) => {
      if (dto.company_name === 'Panne') return failure({ code: 'insufficient_credits', message: 'x' })
      if (dto.company_name === 'Engie')
        return success({ jobId: 'j', accountId: 'acc-engie', launched: false, reason: 'cache_hit' })
      return success({ jobId: 'j', accountId: `acc-${dto.company_name}`, launched: true })
    }),
    getStatus: jest.fn(),
    cancelByUser: jest.fn(async () => success({ accountId: 'x' })),
  }
  const companies = {
    search: jest.fn(async (q: string) => {
      if (q === 'BPCE') return { suggestions: [{ name: 'BPCE', siren: '493455042', city: 'Paris', sector: '' }] }
      if (q === 'Total')
        return {
          suggestions: [
            { name: 'TotalEnergies SE', siren: '542051180', city: 'Courbevoie', sector: '' },
            { name: 'Total Marketing', siren: '542034921', city: 'Nanterre', sector: '' },
          ],
        }
      return { suggestions: [] }
    }),
  }
  const workspaceContext = {
    isDemoWorkspace: jest.fn(async () => Boolean(opts.demo)),
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1' })),
  }
  const service = new AnalysisBatchesService(batches as never, items as never)
  const ports: AnalysisBatchPorts = {
    workspaceId: 'ws-1',
    isDemo: workspaceContext.isDemoWorkspace,
    planLaunch: analysis.planLaunch as never,
    start: analysis.start as never,
    getStatus: analysis.getStatus as never,
    cancel: analysis.cancelByUser as never,
    searchCompanies: companies.search as never,
  }
  return { service: bind(service, ports), batches, items, analysis, companies }
}

describe('AnalysisBatchesService — #2293 lot d’analyses multi-comptes', () => {
  describe('preview (#2293.4) — rien n’est lancé ni débité', () => {
    it('dédoublonne, compte les déjà-analysés, et totalise le coût EXACT des seules analyses neuves', async () => {
      const { service, analysis } = build()
      const preview = await service.preview('u1', {
        source: 'names',
        items: [
          { name: 'Eiffage', siren: '709802094' },
          { name: 'Engie' },
          { name: 'eiffage', siren: '709802094' },
          { name: 'BPCE' },
        ],
      })
      expect(preview.duplicates).toBe(1)
      expect(preview.counts).toEqual({ resolved: 3, toConfirm: 0, alreadyAnalyzed: 1, fresh: 2 })
      expect(preview.totalCredits).toBe(16)
      expect(preview.parallelRuns).toBeGreaterThan(0)
      expect(analysis.start).not.toHaveBeenCalled()
    })

    it('un nom qui désigne UNE entité est résolu avec son SIREN ; un nom ambigu est « à confirmer » avec ses candidats', async () => {
      const { service } = build()
      const preview = await service.preview('u1', { source: 'names', items: [{ name: 'BPCE' }, { name: 'Total' }] })
      expect(preview.items[0]).toMatchObject({ resolution: 'resolved', siren: '493455042', credits: 8 })
      expect(preview.items[1]).toMatchObject({ resolution: 'to_confirm', siren: null, credits: null })
      expect(preview.items[1]?.candidates).toHaveLength(2)
      expect(preview.counts.toConfirm).toBe(1)
      expect(preview.totalCredits).toBe(8)
    })

    it('deux noms qui résolvent le MÊME SIREN sont un doublon', async () => {
      const { service } = build()
      const preview = await service.preview('u1', {
        source: 'names',
        items: [{ name: 'BPCE' }, { name: 'Groupe BPCE', siren: '493455042' }],
      })
      expect(preview.items).toHaveLength(1)
      expect(preview.duplicates).toBe(1)
    })

    it('en démo : aucun appel au registre, rien à débiter', async () => {
      const { service, companies } = build({ demo: true })
      const preview = await service.preview('u1', { source: 'names', items: [{ name: 'Total' }] })
      expect(companies.search).not.toHaveBeenCalled()
      expect(preview.demo).toBe(true)
      expect(preview.totalCredits).toBe(0)
      expect(preview.items[0]).toMatchObject({ resolution: 'resolved', scenario: 'demo' })
    })
  })

  describe('create (#2293.5) — un parent, un sous-job par entreprise', () => {
    it('lance les entreprises résolues, garde les ambiguës à confirmer, et une erreur ne bloque pas les autres (#2293.7)', async () => {
      const { service, analysis } = build()
      const batch = await service.create('u1', {
        source: 'discover',
        items: [
          { name: 'Panne', siren: '111111111' },
          { name: 'Eiffage', siren: '709802094' },
          { name: 'Engie' },
          { name: 'Total' },
        ],
      })
      expect(analysis.start).toHaveBeenCalledTimes(3)
      const byName = Object.fromEntries(batch.items.map(item => [item.name, item]))
      expect(byName.Panne).toMatchObject({ state: 'failed', failureCode: 'insufficient_credits', charged: false })
      expect(byName.Eiffage).toMatchObject({ state: 'queued', accountId: 'acc-Eiffage', charged: true })
      // Déjà analysé : rouvert sans débit.
      expect(byName.Engie).toMatchObject({ state: 'done', charged: false })
      expect(byName.Total).toMatchObject({ state: 'to_confirm' })
      expect(batch.charged).toBe(1)
      expect(batch.status).toBe('running')
      expect(batch.source).toBe('discover')
    })
  })

  // #2922 — le mode choisi sur la chip (`SurfaceContextChip surface="analysis_batch"`)
  // part avec CHAQUE sous-job, et survit à une reprise : jamais un retour
  // silencieux à « Mon activité » quand `retry`/`confirm` relancent plus tard.
  describe('context_mode (#2922) — le mode choisi sur la chip suit chaque sous-job', () => {
    it('un lot lancé avec un mode le transmet à CHAQUE analyse unitaire', async () => {
      const { service, analysis } = build()
      const batch = await service.create('u1', {
        source: 'names',
        items: [
          { name: 'Eiffage', siren: '709802094' },
          { name: 'Vinci', siren: '552037806' },
        ],
        context_mode: 'one_off_mission',
      })
      expect(analysis.start).toHaveBeenCalledTimes(2)
      for (const call of analysis.start.mock.calls) {
        expect(call[0]).toMatchObject({ context_mode: 'one_off_mission' })
      }
      expect(batch.contextMode).toBe('one_off_mission')
    })

    it('sans mode choisi : absent du sous-job, et le lot le dit (`null`, jamais un mode deviné)', async () => {
      const { service, analysis } = build()
      const batch = await service.create('u1', { source: 'names', items: [{ name: 'Eiffage', siren: '709802094' }] })
      expect(analysis.start.mock.calls[0]?.[0]).not.toHaveProperty('context_mode')
      expect(batch.contextMode).toBeNull()
    })

    it('une reprise (retry) relance avec le MÊME mode que le lancement d’origine', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', {
        source: 'names',
        items: [{ name: 'Panne', siren: '111111111' }],
        context_mode: 'neutral',
      })
      analysis.start.mockClear()
      await service.retry('u1', created.id)
      expect(analysis.start).toHaveBeenCalledTimes(1)
      expect(analysis.start.mock.calls[0]?.[0]).toMatchObject({ context_mode: 'neutral' })
    })

    it('confirmer une entité ambiguë relance avec le MÊME mode que le lancement d’origine', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', {
        source: 'names',
        items: [{ name: 'Total' }],
        context_mode: 'neutral',
      })
      const itemId = created.items[0]?.id as string
      await service.confirm('u1', created.id, itemId, '542051180')
      expect(analysis.start).toHaveBeenCalledWith(expect.objectContaining({ context_mode: 'neutral' }), 'u1')
    })
  })

  it('l’origine « suggestion » d’une saisie Découvrir suit SON sous-job au lancement', async () => {
    const { service, analysis } = build()
    await service.create('u1', {
      source: 'discover',
      items: [
        { name: 'Eiffage', siren: '709802094', suggestion_id: 'sug-1', suggestion_reason: 'signal' },
        { name: 'Vinci', siren: '552037806' },
      ],
    })
    expect(analysis.start).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Eiffage', suggestion_id: 'sug-1', suggestion_reason: 'signal' }),
      'u1',
    )
    expect(analysis.start.mock.calls[1]?.[0]).not.toHaveProperty('suggestion_id')
  })

  // #3819 (lot RBB) — une analyse de LOT depuis Découvrir garde aussi ses critères.
  it('#3819 — les critères Découvrir d’une saisie suivent SON sous-job', async () => {
    const { service, analysis } = build()
    await service.create('u1', {
      source: 'discover',
      items: [
        {
          name: 'Eiffage',
          siren: '709802094',
          suggestion_id: 'discover:709802094',
          suggestion_criteria: { zone: 'Lille', signals: ['hiring'] },
        },
        { name: 'Vinci', siren: '552037806' },
      ],
    })
    expect(analysis.start).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Eiffage', suggestion_criteria: { zone: 'Lille', signals: ['hiring'] } }),
      'u1',
    )
    expect(analysis.start.mock.calls[1]?.[0]).not.toHaveProperty('suggestion_criteria')
  })

  describe('get — l’état d’un sous-job se lit sur son analyse', () => {
    it('une analyse terminée passe le sous-job à done, une analyse morte après des phases à partial', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', {
        source: 'names',
        items: [
          { name: 'Eiffage', siren: '709802094' },
          { name: 'Vinci', siren: '552037806' },
        ],
      })
      analysis.getStatus.mockImplementation(async (accountId: string) =>
        success(
          accountId === 'acc-Eiffage'
            ? { jobId: 'j', state: 'completed', percent: 100, phase: 'analysis_done', completedPhases: [] }
            : { jobId: 'j', state: 'failed', percent: 0, phase: null, completedPhases: ['research'] },
        ),
      )
      const batch = await service.get('u1', created.id)
      expect(batch.items.map(item => item.state)).toEqual(['done', 'partial'])
      expect(batch.status).toBe('finished_with_failures')
    })

    it('#4671 — la LISTE relit aussi les sous-jobs en vol : un lot terminé ne reste pas « en cours »', async () => {
      const { service, analysis } = build()
      await service.create('u1', {
        source: 'names',
        items: [
          { name: 'Eiffage', siren: '709802094' },
          { name: 'Vinci', siren: '552037806' },
        ],
      })
      analysis.getStatus.mockResolvedValue(
        success({ jobId: 'j', state: 'completed', percent: 100, phase: 'analysis_done', completedPhases: [] }),
      )
      const [batch] = await service.list('u1')
      expect(batch?.status).toBe('finished')
      expect(batch?.counts.queued + batch!.counts.running).toBe(0)
      expect(batch?.counts.done).toBe(2)
    })

    it('#4671 — sait dire NON : une analyse réellement en vol reste « en cours » dans la liste', async () => {
      const { service, analysis } = build()
      await service.create('u1', { source: 'names', items: [{ name: 'Eiffage', siren: '709802094' }] })
      analysis.getStatus.mockResolvedValue(
        success({ jobId: 'j', state: 'active', percent: 40, phase: 'research', completedPhases: [] }),
      )
      const [batch] = await service.list('u1')
      expect(batch?.status).toBe('running')
      expect(batch?.counts.running).toBe(1)
    })

    it('un lot d’un autre espace est introuvable', async () => {
      const { service, batches } = build()
      batches.rows.push({ id: 'b-other', workspace_id: 'ws-2' } as AnalysisBatchEntity)
      await expect(service.get('u1', 'b-other')).rejects.toThrow()
    })

    it('#2283.32 — une analyse terminée mais dont le Résolveur d’identité (#2284) reste ambigu passe à needs_resolution, jamais done', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', { source: 'names', items: [{ name: 'Eiffage', siren: '709802094' }] })
      analysis.getStatus.mockResolvedValue(
        success({
          jobId: 'j',
          state: 'completed',
          percent: 100,
          phase: 'analysis_done',
          completedPhases: [],
          entityAmbiguity: {
            candidates: [{ name: 'Eiffage SA', siren: '709802094', city: 'Vélizy' }],
          },
        }),
      )
      const batch = await service.get('u1', created.id)
      expect(batch.items[0]).toMatchObject({ state: 'needs_resolution' })
      expect(batch.items[0]?.candidates).toEqual([{ name: 'Eiffage SA', siren: '709802094', city: 'Vélizy' }])
      expect(batch.status).toBe('needs_confirmation')
    })
  })

  describe('cancel / retry / confirm', () => {
    it('annuler arrête les analyses en vol (remboursées par l’annulation unitaire) et date le geste', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', {
        source: 'names',
        items: [{ name: 'Eiffage', siren: '709802094' }, { name: 'Total' }],
      })
      analysis.getStatus.mockResolvedValue(
        success({ jobId: 'j', state: 'active', percent: 10, phase: 'research', completedPhases: [] }),
      )
      const batch = await service.cancel('u1', created.id)
      expect(analysis.cancelByUser).toHaveBeenCalledWith('acc-Eiffage', 'u1')
      expect(batch.items.map(item => item.state)).toEqual(['canceled', 'canceled'])
      expect(batch.status).toBe('canceled')
      expect(batch.canceledAt).not.toBeNull()
    })

    it('reprendre relance les seuls sous-jobs échoués', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', {
        source: 'names',
        items: [
          { name: 'Panne', siren: '111111111' },
          { name: 'Eiffage', siren: '709802094' },
        ],
      })
      analysis.start.mockClear()
      analysis.getStatus.mockResolvedValue(
        success({ jobId: 'j', state: 'active', percent: 10, phase: 'research', completedPhases: [] }),
      )
      await service.retry('u1', created.id)
      expect(analysis.start).toHaveBeenCalledTimes(1)
      expect(analysis.start.mock.calls[0]?.[0]).toMatchObject({ company_name: 'Panne' })
    })

    it('confirmer une entité lance CE sous-job avec le SIREN choisi', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', { source: 'names', items: [{ name: 'Total' }] })
      const itemId = created.items[0]?.id as string
      const batch = await service.confirm('u1', created.id, itemId, '542051180')
      expect(analysis.start).toHaveBeenCalledWith(
        expect.objectContaining({ company_name: 'Total', siren: '542051180' }),
        'u1',
      )
      expect(batch.items[0]).toMatchObject({ state: 'queued', siren: '542051180' })
    })
  })

  describe('exclure du lot (#2283.32) — l’autre issue d’une ambiguïté, jamais un lancement ni un remboursement', () => {
    it('exclut un nom à confirmer : aucun lancement, les autres sous-jobs restent intacts', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', {
        source: 'names',
        items: [{ name: 'Total' }, { name: 'Eiffage', siren: '709802094' }],
      })
      const itemId = created.items[0]?.id as string
      const batch = await service.exclude('u1', created.id, itemId)
      expect(batch.items[0]).toMatchObject({ state: 'canceled' })
      expect(batch.items[1]).toMatchObject({ state: 'queued' })
      expect(analysis.start).toHaveBeenCalledTimes(1)
    })

    it('exclut une identité ambiguë trouvée après coup, sans toucher au dossier déjà livré', async () => {
      const { service, analysis } = build()
      const created = await service.create('u1', { source: 'names', items: [{ name: 'Eiffage', siren: '709802094' }] })
      analysis.getStatus.mockResolvedValue(
        success({
          jobId: 'j',
          state: 'completed',
          percent: 100,
          phase: 'analysis_done',
          completedPhases: [],
          entityAmbiguity: { candidates: [{ name: 'Eiffage SA', siren: '709802094', city: 'Vélizy' }] },
        }),
      )
      const refreshed = await service.get('u1', created.id)
      const itemId = refreshed.items[0]?.id as string
      const batch = await service.exclude('u1', created.id, itemId)
      expect(batch.items[0]).toMatchObject({ state: 'canceled', accountId: 'acc-Eiffage' })
    })

    it('refuse d’exclure un sous-job déjà tranché (résolu, en vol, terminé…)', async () => {
      const { service } = build()
      const created = await service.create('u1', { source: 'names', items: [{ name: 'Eiffage', siren: '709802094' }] })
      const itemId = created.items[0]?.id as string
      await expect(service.exclude('u1', created.id, itemId)).rejects.toThrow()
    })
  })
})
