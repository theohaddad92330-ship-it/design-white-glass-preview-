import { lauraJobViewSchema } from '@bellum/contracts'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { LauraJobService } from './laura-job.service'
import { inMemoryRepository } from './testing/in-memory-repository'

/**
 * #2276 — la demande complexe devient UN job persistant. `proposeFromTurn` reçoit
 * le `context.laura_job` BRUT de l'événement `done` du service IA : une sortie de
 * modèle, donc une donnée non fiable — validée, bornée à l'espace, jamais complétée.
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const OTHER_WS = '7a0c2f10-0000-4000-8000-000000000009'
const AUTHOR = '9d359267-0000-4000-8000-000000000001'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const FOREIGN_ACCOUNT = '11111111-1111-4111-8111-999999999999'
const TURN = '33333333-3333-4333-8333-333333333331'
const principal = { userId: AUTHOR, email: 'rep@esn.fr' }

const raw = (overrides: Record<string, unknown> = {}) => ({
  originalRequest: 'Analyse les 20 filiales de Thales et trouve 50 décideurs',
  intent: 'Cartographier les décideurs des filiales',
  expectedOutcome: '50 décideurs rattachés à leur filiale',
  scope: { description: 'Filiales françaises de Thales', accountIds: [ACCOUNT, FOREIGN_ACCOUNT] },
  steps: [
    { key: 'analyse', label: 'Analyser les filiales', capability: 'account_analysis', units: 20 },
    { key: 'enrich', label: 'Enrichir', capability: 'contact_enrichment', units: 50, dependsOn: ['analyse'] },
  ],
  ...overrides,
})

function harness(options: { demo?: boolean; remaining?: number | null } = {}) {
  const runs = inMemoryRepository<WorkflowRunEntity>({
    unique: {
      name: 'workflow_runs_idempotency_idx',
      clash: (rows, candidate) =>
        rows.some(
          row => row.workspace_id === candidate.workspace_id && row.idempotency_key === candidate.idempotency_key,
        ),
    },
  })
  const accounts = inMemoryRepository<{ id: string; workspace_id: string }>()
  accounts.rows.push({ id: ACCOUNT, workspace_id: WS }, { id: FOREIGN_ACCOUNT, workspace_id: OTHER_WS })
  const contacts = inMemoryRepository<{ id: string; workspace_id: string }>()
  const workspaces = { workspaceOf: jest.fn(async () => ({ workspaceId: WS, isDemo: Boolean(options.demo) })) }
  const reservations = {
    reserve: jest.fn(async () => ({})),
    settle: jest.fn(async () => undefined),
    sweepExpired: jest.fn(async () => 0),
  }
  const balance = { remainingOf: jest.fn(async () => (options.remaining === undefined ? 1000 : options.remaining)) }
  const enqueuer = { enqueue: jest.fn(async () => undefined) }
  const service = new LauraJobService(
    runs as never,
    accounts as never,
    contacts as never,
    workspaces as never,
    reservations as never,
    balance as never,
    enqueuer as never,
  )
  return { service, runs, accounts, contacts, reservations, balance, enqueuer }
}

describe('LauraJobService.proposeFromTurn — #2276.1 / #2276.2', () => {
  it('persiste UN job à confirmer, avec sa fiche, son owner et sa conversation — et rien ne part', async () => {
    const { service, runs } = harness()
    const out = await service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: TURN, raw: raw() })

    expect(out.outcome).toBe('persisted')
    expect(runs.rows).toHaveLength(1)
    const row = runs.rows[0]
    expect(row.trigger).toBe('laura_job')
    expect(row.definition_key).toBe('laura_job')
    expect(row.status).toBe('to_confirm')
    expect(row.user_id).toBe(AUTHOR)
    expect(row.conversation_id).toBe('thread-1')
    expect(row.turn_id).toBe(TURN)
    // Le coût maximum vient de la grille, jamais du modèle ; rien n'est débité.
    expect(row.estimated_credits).toBe(20 * 10 + 50)
    expect(row.spent_credits).toBe(0)
    expect(row.started_at).toBeNull()
    expect(row.job?.originalRequest).toMatch(/20 filiales/)

    // L'identifiant du dépôt en mémoire n'est pas un uuid ; tout le reste est la forme servie.
    const view = lauraJobViewSchema.parse({ ...out.job, id: '44444444-4444-4444-8444-444444444444' })
    expect(view.state).toBe('to_confirm')
    expect(view.ownerId).toBe(AUTHOR)
    expect(view.progress).toEqual({ done: 0, total: 2 })
    expect(view.tools).toEqual(['account_analysis', 'contact_enrichment'])
  })

  // #2276.31 — une NOUVELLE demande dans le même fil remplace un job encore « À confirmer » : il devient Obsolète.
  it('#2276.31 — un job « À confirmer » du même fil passe Obsolète quand une nouvelle demande le remplace', async () => {
    const { service, runs } = harness()
    const first = await service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: TURN, raw: raw() })
    const SECOND = '33333333-3333-4333-8333-333333333332'
    await service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: SECOND, raw: raw() })
    expect(runs.rows).toHaveLength(2)
    expect(runs.rows.find(row => row.turn_id === TURN)?.status).toBe('superseded')
    expect(runs.rows.find(row => row.turn_id === SECOND)?.status).toBe('to_confirm')
    expect(first.job?.state).toBe('to_confirm')
  })

  it('NON : un autre fil, un job déjà confirmé, ou le même tour rejoué ne passent jamais Obsolète', async () => {
    const { service, runs } = harness()
    await service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: TURN, raw: raw() })
    const SECOND = '33333333-3333-4333-8333-333333333332'
    await service.proposeFromTurn({ principal, conversationId: 'thread-2', turnId: SECOND, raw: raw() })
    expect(runs.rows.map(row => row.status)).toEqual(['to_confirm', 'to_confirm'])
    runs.rows[0].status = 'planned'
    const THIRD = '33333333-3333-4333-8333-333333333333'
    await service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: THIRD, raw: raw() })
    expect(runs.rows[0].status).toBe('planned')
    await service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: THIRD, raw: raw() })
    expect(runs.rows.find(row => row.turn_id === THIRD)?.status).toBe('to_confirm')
  })

  it('un compte d’un autre espace sort du périmètre — jamais une cible devinée', async () => {
    const { service, runs } = harness()
    await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: raw() })
    expect(runs.rows[0].job?.scope.accountIds).toEqual([ACCOUNT])
  })

  it('le modèle ne peut pas déclarer un travail déjà fait : étapes, résultats, erreurs repartent à zéro', async () => {
    const { service, runs } = harness()
    const claimed = raw({
      steps: [{ key: 'analyse', label: 'Analyser', capability: 'account_analysis', status: 'done' }],
      intermediateResults: [{ stepKey: 'analyse', summary: 'Fait', at: '2026-09-24T10:00:00.000Z' }],
      createdObjects: [{ kind: 'account', id: 'x', label: 'Faux' }],
    })
    await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: claimed })
    const job = runs.rows[0].job
    expect(job?.steps[0].status).toBe('todo')
    expect(job?.intermediateResults).toEqual([])
    expect(job?.createdObjects).toEqual([])
  })

  it('#2276 tranche 2 — le modèle ne peut ni VALIDER une étape, ni en déclarer la preuve', async () => {
    const { service, runs } = harness()
    const claimed = raw({
      steps: [
        {
          key: 'crm',
          label: 'Écrire au CRM',
          capability: 'crm_write',
          approvedBy: AUTHOR,
          approvedAt: '2026-09-24T10:00:00.000Z',
          creditsSpent: 3,
          startedAt: '2026-09-24T10:00:00.000Z',
          finishedAt: '2026-09-24T10:00:00.000Z',
          note: 'refused',
        },
      ],
    })
    await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: claimed })
    expect(runs.rows[0].job?.steps[0]).toMatchObject({
      approvedBy: null,
      approvedAt: null,
      creditsSpent: null,
      startedAt: null,
      finishedAt: null,
      note: null,
    })
  })

  it('#3860.1 / #3860.2 — le modèle ne déclare ni une attente d’analyse, ni des identités produites', async () => {
    const { service, runs } = harness()
    const claimed = raw({
      steps: [
        {
          key: 'analyse',
          label: 'Analyser',
          capability: 'account_analysis',
          awaiting: [{ accountId: AUTHOR, runRef: 'forged', launchedAt: '2026-09-24T10:00:00.000Z' }],
          produced: { accountIds: [AUTHOR], contactIds: [AUTHOR] },
        },
      ],
    })
    await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: claimed })
    expect(runs.rows[0].job?.steps[0]).toMatchObject({ awaiting: [], produced: { accountIds: [], contactIds: [] } })
  })

  it('rejouer le même tour rend le même job (idempotent)', async () => {
    const { service, runs } = harness()
    await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: raw() })
    const again = await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: raw() })
    expect(again.outcome).toBe('reused')
    expect(runs.rows).toHaveLength(1)
  })

  it('une fiche invalide (dépendance vers une étape plus bas) n’ouvre aucun job', async () => {
    const { service, runs } = harness()
    const invalid = raw({
      steps: [
        { key: 'a', label: 'A', capability: 'read_workspace', dependsOn: ['b'] },
        { key: 'b', label: 'B', capability: 'read_workspace' },
      ],
    })
    const out = await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: invalid })
    expect(out).toEqual({ outcome: 'invalid', job: null })
    expect(runs.rows).toHaveLength(0)
  })

  it('rien de reçu, rien d’ouvert', async () => {
    const { service } = harness()
    expect(await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: undefined })).toEqual({
      outcome: 'absent',
      job: null,
    })
  })

  it('en démonstration, rien n’est persisté', async () => {
    const { service, runs } = harness({ demo: true })
    const out = await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: raw() })
    expect(out.outcome).toBe('demo')
    expect(runs.rows).toHaveLength(0)
  })

  it('#2276.22 — une fiche qui suppose sans périmètre résolu reste Brouillon', async () => {
    const { service, runs } = harness()
    await service.proposeFromTurn({
      principal,
      conversationId: null,
      turnId: TURN,
      raw: raw({
        scope: { description: 'Les filiales de Thales' },
        assumptions: ['Je suppose les filiales françaises'],
      }),
    })
    expect(runs.rows[0].status).toBe('draft')
  })

  // #2276.49 — la durée ne vient JAMAIS du modèle : mesurée sur les jobs finis de l'espace, ou absente.
  const pastJob = (workspaceId: string, turn: string) =>
    ({
      id: `past-${turn}`,
      workspace_id: workspaceId,
      user_id: AUTHOR,
      definition_key: 'laura_job',
      status: 'done',
      idempotency_key: `job:${turn}`,
      finished_at: new Date('2026-09-23T10:00:00.000Z'),
      job: {
        ...raw(),
        steps: [
          {
            ...raw().steps[0],
            status: 'done',
            startedAt: '2026-09-23T09:00:00.000Z',
            finishedAt: '2026-09-23T09:00:40.000Z', // 2 s / unité sur 20
          },
          {
            ...raw().steps[1],
            status: 'done',
            startedAt: '2026-09-23T09:00:40.000Z',
            finishedAt: '2026-09-23T09:01:30.000Z', // 1 s / unité sur 50
          },
        ],
      },
    }) as unknown as WorkflowRunEntity

  it('#2276.62 — les jobs d’un fil : les siens, de ce fil ; jamais ceux d’un autre, jamais tout l’espace', async () => {
    const { service, runs } = harness()
    await service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: TURN, raw: raw() })
    runs.rows.push({ ...runs.rows[0], id: 'other-user', user_id: OTHER_WS, turn_id: 'x' } as WorkflowRunEntity)
    const views = await service.listForThread(principal, { conversationId: 'thread-1', turnIds: [] })
    expect(views.map(view => view.turnId)).toEqual([TURN])
    expect(await service.listForThread(principal, { conversationId: null, turnIds: [] })).toEqual([])
    const byTurn = await service.listForThread(principal, { conversationId: null, turnIds: [TURN] })
    expect(byTurn).toHaveLength(1)
  })

  it('#2276.49 — une durée proposée par le modèle est jetée ; sans mesure, rien', async () => {
    const { service, runs } = harness()
    await service.proposeFromTurn({
      principal,
      conversationId: null,
      turnId: TURN,
      raw: raw({ estimatedDurationSeconds: 600, estimatedDurationBasis: 9 }),
    })
    expect(runs.rows[0].job?.estimatedDurationSeconds).toBeNull()
    expect(runs.rows[0].job?.estimatedDurationBasis).toBeNull()
  })

  it('#2276.49 — mesurée sur les jobs FINIS de l’espace, jamais d’un autre', async () => {
    const { service, runs } = harness()
    runs.rows.push(pastJob(WS, 'a'), pastJob(OTHER_WS, 'b'))
    await service.proposeFromTurn({ principal, conversationId: null, turnId: TURN, raw: raw() })
    const created = runs.rows.find(row => row.turn_id === TURN)
    // 2 s × 20 + 1 s × 50, sur deux étapes mesurées (l'autre espace n'entre pas).
    expect(created?.job?.estimatedDurationSeconds).toBe(90)
    expect(created?.job?.estimatedDurationBasis).toBe(2)
  })
})

describe('LauraJobService — les gestes (#2276 tranche 2)', () => {
  const OTHER = '9d359267-0000-4000-8000-000000000002'

  async function proposed(options: Parameters<typeof harness>[0] = {}, rawOverrides: Record<string, unknown> = {}) {
    const h = harness(options)
    await h.service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: TURN, raw: raw(rawOverrides) })
    return { ...h, id: h.runs.rows[0].id, row: () => h.runs.rows[0] }
  }

  it('Confirmer : réserve le coût MAXIMUM chez le module crédits, planifie, met en file — sans rien débiter', async () => {
    const { service, id, row, reservations, enqueuer } = await proposed()
    const view = await service.confirm(id, principal)
    expect(row().status).toBe('planned')
    expect(view.state).toBe('planned')
    expect(reservations.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        userId: AUTHOR,
        amount: 20 * 10 + 50,
        reference: row().correlation_id,
      }),
    )
    expect(enqueuer.enqueue).toHaveBeenCalledWith({ jobId: id, workspaceId: WS, userId: AUTHOR, email: 'rep@esn.fr' })
    expect(row().spent_credits).toBe(0)
  })

  it('NON : solde insuffisant — rien n’est réservé, rien ne part, le job reste à confirmer', async () => {
    const { service, id, row, reservations, enqueuer } = await proposed({ remaining: 10 })
    await expect(service.confirm(id, principal)).rejects.toMatchObject({ status: 402 })
    expect(row().status).toBe('to_confirm')
    expect(reservations.reserve).not.toHaveBeenCalled()
    expect(enqueuer.enqueue).not.toHaveBeenCalled()
  })

  it('NON : le job d’un autre utilisateur est introuvable (espace ET personne)', async () => {
    const { service, id, row } = await proposed()
    await expect(service.confirm(id, { userId: OTHER, email: 'x@esn.fr' })).rejects.toMatchObject({ status: 404 })
    expect(row().status).toBe('to_confirm')
  })

  it('NON : un brouillon ne se confirme pas (409)', async () => {
    const { service, id } = await proposed(
      {},
      { scope: { description: 'Les filiales' }, assumptions: ['Je suppose les filiales françaises'] },
    )
    await expect(service.confirm(id, principal)).rejects.toMatchObject({ status: 409 })
  })

  it('deux clics : un seul départ', async () => {
    const { service, id, enqueuer } = await proposed()
    await service.confirm(id, principal)
    await expect(service.confirm(id, principal)).rejects.toMatchObject({ status: 409 })
    expect(enqueuer.enqueue).toHaveBeenCalledTimes(1)
  })

  it('Annuler libère la réservation', async () => {
    const { service, id, row, reservations } = await proposed()
    await service.confirm(id, principal)
    await service.cancel(id, principal)
    expect(row().status).toBe('cancelled')
    expect(reservations.settle).toHaveBeenCalledWith(WS, row().correlation_id, 'released')
  })

  it('Valider : seule l’étape qui attend, validée par la personne elle-même, puis la suite repart', async () => {
    const { service, id, row, enqueuer, runs } = await proposed(
      {},
      {
        steps: [
          { key: 'enrich', label: 'Enrichir', capability: 'contact_enrichment', units: 2 },
          { key: 'crm', label: 'Consigner', capability: 'crm_write', dependsOn: ['enrich'] },
        ],
      },
    )
    const job = row().job
    runs.rows[0].status = 'awaiting_approval'
    runs.rows[0].job = job ? { ...job, steps: job.steps.map((s, i) => (i === 0 ? { ...s, status: 'done' } : s)) } : null
    await expect(service.approve(id, principal, 'enrich')).rejects.toMatchObject({ status: 409 })
    await service.approve(id, principal, 'crm')
    expect(row().job?.steps[1]).toMatchObject({ approvedBy: AUTHOR, approvedAt: expect.any(String) })
    expect(row().status).toBe('planned')
    expect(enqueuer.enqueue).toHaveBeenCalledTimes(1)
  })

  it('Reprendre un job partiel remet à faire ce qui a échoué — et NON sur `unknown`', async () => {
    const { service, id, row, runs, enqueuer } = await proposed()
    const job = row().job
    if (!job) throw new Error('job absent')
    runs.rows[0].status = 'partial'
    runs.rows[0].job = {
      ...job,
      steps: [
        { ...job.steps[0], status: 'done' },
        { ...job.steps[1], status: 'failed' },
      ],
    }
    await service.resume(id, principal)
    expect(row().status).toBe('planned')
    expect(row().job?.steps.map(s => s.status)).toEqual(['done', 'todo'])
    expect(enqueuer.enqueue).toHaveBeenCalledTimes(1)

    runs.rows[0].status = 'unknown'
    runs.rows[0].job = {
      ...job,
      steps: [
        { ...job.steps[0], status: 'done' },
        { ...job.steps[1], status: 'unknown' },
      ],
    }
    await expect(service.resume(id, principal)).rejects.toMatchObject({ status: 409 })
    expect(enqueuer.enqueue).toHaveBeenCalledTimes(1)
  })
})

/**
 * #3860.4 — DÉCISION LOUIS 09/10 : la synthèse est la DERNIÈRE étape d'un job,
 * lue depuis `produced` des étapes ; le serveur relit les NOMS (de CET espace)
 * pour que la carte porte des liens lisibles. Aucun débit.
 */
describe('LauraJobService.view — la synthèse (#3860.4)', () => {
  const CONTACT = '22222222-2222-4222-8222-222222222222'

  async function finished(status: WorkflowRunEntity['status']) {
    const h = harness()
    h.accounts.rows[0] = { ...h.accounts.rows[0], company_name: 'Alstom' } as never
    h.accounts.rows[1] = { ...h.accounts.rows[1], company_name: 'Concurrent' } as never
    h.contacts.rows.push({ id: CONTACT, workspace_id: WS, full_name: 'Directrice des achats' } as never)
    await h.service.proposeFromTurn({ principal, conversationId: 'thread-1', turnId: TURN, raw: raw() })
    const row = h.runs.rows[0]
    const job = row.job as { steps: Array<Record<string, unknown>> }
    job.steps[0] = {
      ...job.steps[0],
      status: 'done',
      // Une identité d'un AUTRE espace ne se nomme jamais, même si une fiche la porte.
      produced: { accountIds: [ACCOUNT, FOREIGN_ACCOUNT], contactIds: [CONTACT] },
    }
    job.steps[1] = { ...job.steps[1], status: 'unknown' }
    row.status = status
    return { ...h, id: row.id }
  }

  it('un job au bout : comptes analysés et contacts NOMMÉS, étape `unknown` nommée, rien débité', async () => {
    const { service, id, reservations } = await finished('partial')
    const view = await service.view(id, principal)
    expect(view.synthesis?.accounts).toEqual([{ id: ACCOUNT, name: 'Alstom' }])
    expect(view.synthesis?.contacts).toEqual([{ id: CONTACT, name: 'Directrice des achats' }])
    expect(view.synthesis?.unknown).toEqual([{ key: 'enrich', label: 'Enrichir' }])
    expect(reservations.reserve).not.toHaveBeenCalled()
    expect(lauraJobViewSchema.shape.synthesis.safeParse(view.synthesis).success).toBe(true)
  })

  it('NON : un job qui tourne encore n’a pas de synthèse', async () => {
    const { service, id } = await finished('running')
    expect((await service.view(id, principal)).synthesis).toBeNull()
  })
})
