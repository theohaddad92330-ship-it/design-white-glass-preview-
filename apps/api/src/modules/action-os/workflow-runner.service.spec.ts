import { DEFAULT_APPROVAL_SETTINGS, type ActionIntent } from '@bellum/contracts'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository } from '../../database/test-utils'
import type { ActionRouterService } from '../action-router/action-router.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CreditReservationService } from './credit-reservation.service'
import { findWorkflow } from './workflow-catalog'
import {
  currentStepKeyOf,
  nextStepKeyOf,
  retryResumeStepKeyOf,
  runStatusFrom,
  toOutcome,
  WorkflowRunnerService,
  type RunContext,
} from './workflow-runner.service'

/**
 * Le moteur d'exécution gouvernée.
 *
 * Les tests portent sur les quatre promesses qui distinguent ce moteur d'une
 * boucle « pour chaque pas, appeler » : il planifie avant d'agir, il n'exécute
 * pas sans approbation, il ne rejoue pas ce qu'il ne comprend pas, et il ne
 * compte que les crédits réellement dépensés.
 */

const PRINCIPAL = { userId: 'u1', email: 'rep@esn.fr' }

function build(
  options: {
    role?: 'owner' | 'sales'
    dispatch?: jest.Mock
    demo?: boolean
    members?: { userId: string; role: string }[]
    withTasksService?: boolean
  } = {},
) {
  const runs = createMockRepository<WorkflowRunEntity>()
  const approvals = createMockRepository<ApprovalRequestEntity>()
  const workspaces = createMockRepository<WorkspaceEntity>()
  runs.save.mockImplementation(async (e: Partial<WorkflowRunEntity>) => ({ id: 'run-1', ...e }))
  approvals.save.mockImplementation(async (e: Partial<ApprovalRequestEntity>) => ({ id: 'ap-1', ...e }))
  // Un `UpdateResult` comme TypeORM : les réclamations conditionnelles se lisent sur `affected` (D3).
  runs.update.mockResolvedValue({ affected: 1 })
  approvals.update.mockResolvedValue({ affected: 1 })
  workspaces.findOne.mockResolvedValue({})

  const dispatch =
    options.dispatch ?? jest.fn().mockResolvedValue({ type: 'create_crm_note', status: 'done', externalRef: 'x1' })
  const router = { dispatch } as unknown as ActionRouterService
  const reservations = {
    reserve: jest.fn().mockResolvedValue({ id: 'res-1' }),
    settle: jest.fn().mockResolvedValue(undefined),
    sweepExpired: jest.fn().mockResolvedValue(0),
  } as unknown as CreditReservationService
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: options.role ?? 'owner' }),
    isDemoWorkspace: jest.fn().mockResolvedValue(options.demo ?? false),
    listMembers: jest.fn().mockResolvedValue(options.members ?? []),
  } as unknown as WorkspaceContextService

  // #1952.29 — l'accusé de fin part par le mécanisme qui existe déjà : les
  // canaux que l'espace a lui-même branchés. Le port n'est qu'une signature.
  const longJobNotifier = { notifyUser: jest.fn().mockResolvedValue(undefined) }
  // #2276.62 — le retour dans Laura, par la cloche existante (le port n'est
  // qu'une signature, le câblage réel vit dans `action-os.module.ts`).
  const jobReturnNotifier = {
    notify: jest.fn(async (_userId: string, _input: { title: string; link: string }) => undefined),
  }
  // #2946/#2105.9 — le pont Action OS → Tâche : `@Optional`, absent dans tous
  // les autres tests de ce fichier (rien d'autre ne change), présent seulement
  // pour les tests qui le vérifient.
  const tasksService = options.withTasksService ? { create: jest.fn().mockResolvedValue({ id: 'task-1' }) } : undefined

  const service = new WorkflowRunnerService(
    runs as never,
    approvals as never,
    workspaces as never,
    router,
    reservations,
    workspaceContext,
    longJobNotifier,
    jobReturnNotifier,
    tasksService as never,
  )
  return {
    service,
    runs,
    approvals,
    workspaces,
    dispatch,
    reservations,
    workspaceContext,
    longJobNotifier,
    jobReturnNotifier,
    tasksService,
  }
}

const noteIntent: ActionIntent = {
  type: 'create_crm_note',
  contactId: '11111111-1111-1111-1111-111111111111',
  note: 'Compte rendu',
}

function context(over: Partial<RunContext> = {}): RunContext {
  return {
    intents: {},
    targetLabel: 'ACME — Claire Dubois',
    targetCount: 1,
    availableCapabilities: new Set(['crm', 'calendar', 'email', 'notifications', 'prospection']),
    ...over,
  }
}

describe('planification', () => {
  it('range en « bloqué » un pas dont la capacité n’est pas connectée — et dit laquelle', () => {
    const { service } = build()
    const definition = findWorkflow('crm_hygiene')!
    const plan = service.plan(definition, context({ availableCapabilities: new Set() }), DEFAULT_APPROVAL_SETTINGS)
    expect(plan.executableNow).toHaveLength(0)
    expect(plan.blocked).toHaveLength(2)
    expect(plan.blocked[0].missing).toContain('crm')
  })

  it('range en « bloqué » un pas sans cible résolue plutôt que de l’improviser', () => {
    const { service } = build()
    const definition = findWorkflow('crm_hygiene')!
    const plan = service.plan(definition, context(), DEFAULT_APPROVAL_SETTINGS)
    expect(plan.blocked.map(b => b.missing)).toEqual([
      'Aucune cible résolue pour ce pas.',
      'Aucune cible résolue pour ce pas.',
    ])
  })

  it('ne compte dans le devis que ce qui peut réellement partir', () => {
    // Un pas bloqué qui coûterait un crédit ne doit pas gonfler l'estimation :
    // l'utilisateur renoncerait à cause d'une dépense qui n'aura pas lieu.
    const { service } = build()
    const definition = findWorkflow('signal_to_account_opening')!
    const plan = service.plan(definition, context({ availableCapabilities: new Set() }), DEFAULT_APPROVAL_SETTINGS)
    expect(plan.estimatedCredits).toBe(0)
  })

  it('demande une approbation dès qu’un pas est exécutable', () => {
    const { service } = build()
    const definition = findWorkflow('crm_hygiene')!
    const plan = service.plan(
      definition,
      context({ intents: { upsert_record: noteIntent, append_note: noteIntent } }),
      DEFAULT_APPROVAL_SETTINGS,
    )
    expect(plan.approvalRequired).toHaveLength(2)
    expect(plan.requiredLevel).toBe('n2_user_approval')
  })

  it('exécute sans demander quand l’espace est en automatique borné', () => {
    // Les deux pas sont INTERNES : une notification in-app au propriétaire du
    // run, et un rappel daté à lui-même. Rien ne sort, rien n'atteint personne.
    const { service } = build()
    const definition = findWorkflow('dormant_account_revival')!
    const plan = service.plan(
      definition,
      context({ intents: { notify_owner: noteIntent, schedule_decision: noteIntent } }),
      { ...DEFAULT_APPROVAL_SETTINGS, defaultLevel: 'n4_bounded_auto' },
    )
    expect(plan.approvalRequired).toHaveLength(0)
    expect(plan.executableNow).toHaveLength(2)
  })

  it('n’exécute JAMAIS seul un workflow qui envoie, même en autonomie étendue', () => {
    const { service } = build()
    const definition = findWorkflow('meeting_follow_up')!
    const plan = service.plan(
      definition,
      context({ intents: { log_meeting_note: noteIntent, schedule_next_step: noteIntent, send_recap: noteIntent } }),
      { ...DEFAULT_APPROVAL_SETTINGS, defaultLevel: 'n5_extended_auto' },
    )
    expect(plan.executableNow).toHaveLength(0)
    expect(plan.approvalRequired.map(p => p.step.key)).toContain('send_recap')
    expect(plan.requiredLevel).toBe('n2_user_approval')
  })
})

describe('lancement', () => {
  it('refuse un workflow inconnu plutôt que de créer un run vide', async () => {
    const { service } = build()
    await expect(
      service.start({
        principal: PRINCIPAL,
        definitionKey: 'nope',
        idempotencyKey: 'k'.repeat(10),
        context: context(),
      }),
    ).rejects.toThrow(/inconnu/i)
  })

  it('rend le run existant plutôt que d’en créer un second (double clic)', async () => {
    const { service, runs } = build()
    runs.findOne.mockResolvedValueOnce({ id: 'run-existing', status: 'done' })
    const result = await service.start({
      principal: PRINCIPAL,
      definitionKey: 'crm_hygiene',
      idempotencyKey: 'same-key-123',
      context: context(),
    })
    expect(result.reused).toBe(true)
    expect(result.run.id).toBe('run-existing')
    expect(runs.save).not.toHaveBeenCalled()
  })

  it('rattrape la course entre deux requêtes simultanées', async () => {
    const { service, runs } = build()
    runs.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'run-winner', status: 'running' })
    runs.save.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
    const result = await service.start({
      principal: PRINCIPAL,
      definitionKey: 'crm_hygiene',
      idempotencyKey: 'race-key-123',
      context: context(),
    })
    expect(result.reused).toBe(true)
    expect(result.run.id).toBe('run-winner')
  })

  it('met le run en attente et n’exécute RIEN tant que personne n’a approuvé', async () => {
    const { service, approvals, dispatch } = build()
    const result = await service.start({
      principal: PRINCIPAL,
      definitionKey: 'crm_hygiene',
      idempotencyKey: 'await-key-123',
      context: context({ intents: { upsert_record: noteIntent, append_note: noteIntent } }),
    })
    expect(result.run.status).toBe('awaiting_approval')
    expect(dispatch).not.toHaveBeenCalled()
    expect(approvals.save).toHaveBeenCalledTimes(1)
    // Le résumé est FIGÉ à la demande : c'est ce qui sera approuvé.
    expect(approvals.save.mock.calls[0][0].summary).toContain('ACME')
  })

  // #2946/#2105.9 — LE PONT ACTION OS → TÂCHE : une demande d'approbation qui
  // n'exige que l'auteur (`n2`, sous le seuil manager) pose une tâche de
  // décision SUR L'AUTEUR lui-même — c'est lui qui peut trancher.
  it('#2946 pose une tâche de décision sur l’auteur quand il peut approuver seul', async () => {
    const { service, tasksService } = build({ withTasksService: true })
    const result = await service.start({
      principal: PRINCIPAL,
      definitionKey: 'crm_hygiene',
      idempotencyKey: 'await-task-key-1',
      context: context({ intents: { upsert_record: noteIntent, append_note: noteIntent } }),
    })
    expect(result.run.status).toBe('awaiting_approval')
    expect(tasksService?.create).toHaveBeenCalledTimes(1)
    expect(tasksService?.create).toHaveBeenCalledWith(
      PRINCIPAL.userId,
      expect.objectContaining({ ownerId: PRINCIPAL.userId }),
      'action_os_approval',
      'run-1',
    )
  })

  // Absent (comme dans tous les autres tests de ce fichier), rien ne casse :
  // la tâche ne se crée pas, mais l'approbation continue de fonctionner.
  it('#2946 sans TasksService branché, l’approbation continue de fonctionner', async () => {
    const { service } = build()
    const result = await service.start({
      principal: PRINCIPAL,
      definitionKey: 'crm_hygiene',
      idempotencyKey: 'await-task-key-2',
      context: context({ intents: { upsert_record: noteIntent, append_note: noteIntent } }),
    })
    expect(result.run.status).toBe('awaiting_approval')
  })

  // À `n3` (seuil de volume dépassé), le décideur n'est plus l'auteur mais
  // chaque responsable d'équipe (`team:manage`) — même filtre que
  // `TasksService.requestManagerValidation` (GA-26, pas une seconde règle).
  it('#2946 à n3 (volume), pose une tâche par responsable d’équipe, jamais sur l’auteur', async () => {
    const { service, tasksService } = build({
      withTasksService: true,
      members: [
        { userId: PRINCIPAL.userId, role: 'sales' },
        { userId: 'manager-1', role: 'admin' },
        { userId: 'manager-2', role: 'owner' },
        { userId: 'viewer-1', role: 'viewer' },
      ],
    })
    const result = await service.start({
      principal: PRINCIPAL,
      definitionKey: 'crm_hygiene',
      idempotencyKey: 'await-task-key-3',
      // `bulkThreshold` par défaut est 10 (`DEFAULT_APPROVAL_SETTINGS`) : dix
      // cibles ou plus élèvent le run à `n3_manager_approval`.
      context: context({
        intents: { upsert_record: noteIntent, append_note: noteIntent },
        targetCount: 10,
      }),
    })
    expect(result.run.status).toBe('awaiting_approval')
    expect(tasksService?.create).toHaveBeenCalledTimes(2)
    const ownerIds = tasksService?.create.mock.calls.map(call => call[1].ownerId)
    expect(ownerIds).toEqual(expect.arrayContaining(['manager-1', 'manager-2']))
    expect(ownerIds).not.toContain(PRINCIPAL.userId)
    expect(ownerIds).not.toContain('viewer-1')
  })

  it('D2 — FIGE les intents avec le run, au moment où la demande est montrée', async () => {
    const { service, runs } = build()
    const intents = { upsert_record: noteIntent, append_note: noteIntent }
    await service.start({
      principal: PRINCIPAL,
      definitionKey: 'crm_hygiene',
      idempotencyKey: 'freeze-key-123',
      context: context({ intents }),
    })
    expect(runs.create).toHaveBeenCalledWith(expect.objectContaining({ intents }))
  })

  /**
   * D2 (revue de sécurité, 13/09) — le résumé approuvé ne liste que les pas « à
   * approuver », mais TOUS les intents étaient figés : un pas BLOQUÉ (capacité non
   * connectée) partait quand même après l'approbation, sans avoir été montré.
   */
  it('D2 (revue) — ne FIGE que les intents des pas qui peuvent partir : un pas bloqué n’est pas approuvable en douce', async () => {
    const { service, runs } = build()
    const sendRecap: ActionIntent = { type: 'send_email', contactId: noteIntent.contactId }
    const result = await service.start({
      principal: PRINCIPAL,
      definitionKey: 'meeting_follow_up',
      idempotencyKey: 'blocked-step-123',
      context: context({
        intents: { log_meeting_note: noteIntent, schedule_next_step: noteIntent, send_recap: sendRecap },
        availableCapabilities: new Set(['crm', 'calendar']),
      }),
    })
    expect(result.plan.blocked.map(blocked => blocked.step.key)).toEqual(['send_recap'])
    expect(runs.create).toHaveBeenCalledWith(
      expect.objectContaining({ intents: { log_meeting_note: noteIntent, schedule_next_step: noteIntent } }),
    )
  })

  it('D2 (revue) — en automatique borné, un pas bloqué faute de capacité ne part pas non plus', async () => {
    const { service, workspaces, dispatch } = build()
    workspaces.findOne.mockResolvedValue({ approval_default_level: 'n4_bounded_auto' })
    dispatch.mockResolvedValue({ type: 'notify_user', status: 'done', externalRef: 'n1' })
    await service.start({
      principal: PRINCIPAL,
      definitionKey: 'dormant_account_revival',
      idempotencyKey: 'auto-blocked-123',
      context: context({
        intents: { notify_owner: { type: 'notify_user', title: 'Compte dormant' }, schedule_decision: noteIntent },
        availableCapabilities: new Set(['notifications']),
      }),
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect((dispatch.mock.calls[0][0] as ActionIntent).type).toBe('notify_user')
  })

  it('arrête un run dont rien n’est exécutable en « bloqué » — sans prétendre avoir agi', async () => {
    const { service, dispatch, runs } = build()
    const result = await service.start({
      principal: PRINCIPAL,
      definitionKey: 'crm_hygiene',
      idempotencyKey: 'empty-key-123',
      context: context({ availableCapabilities: new Set() }),
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.run.status).toBe('blocked')
    expect(runs.update).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'blocked' }))
  })
})

describe('exécution après approbation', () => {
  const PERSISTED = { upsert_record: noteIntent, append_note: noteIntent }

  function pendingApproval(over: Partial<ApprovalRequestEntity> = {}) {
    return {
      id: 'ap-1',
      workspace_id: 'ws-1',
      run_id: 'run-1',
      required_level: 'n2_user_approval',
      state: 'pending',
      requested_by: PRINCIPAL.userId,
      expires_at: new Date(Date.now() + 60_000),
      ...over,
    }
  }

  async function approveAndRun(overrides: { dispatch?: jest.Mock; role?: 'owner' | 'sales' } = {}) {
    const harness = build(overrides)
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      definition_key: 'crm_hygiene',
      correlation_id: 'wf_crm_hygiene_x',
      started_at: null,
      steps: [],
      intents: PERSISTED,
    })
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'approve',
    })
    return { ...harness, run }
  }

  it('D2 — une approbation exécute les intents PERSISTÉS — plus jamais `blocked` faute de cible', async () => {
    // Le contrôleur passait `intents: {}` : chaque pas était sauté, le run
    // finissait `blocked`, rien ne partait. La signature n'accepte plus de
    // contexte : ce qui s'exécute est ce que le run a figé.
    const { run, dispatch } = await approveAndRun()
    expect(run.status).toBe('done')
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'create_crm_note', contactId: noteIntent.contactId })
  })

  it('D2 — une demande créée AVANT la persistance des intents n’est pas exécutée : 400, et elle reste en attente', async () => {
    const harness = build()
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      definition_key: 'crm_hygiene',
      correlation_id: 'wf_crm_hygiene_x',
      steps: [],
      intents: null,
    })
    await expect(
      harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' }),
    ).rejects.toThrow(/date d'avant/i)
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.approvals.update).not.toHaveBeenCalled()
  })

  it('I5 — chaque dispatch porte la clé `<runId>:<pas>:<tentative>`', async () => {
    const { dispatch } = await approveAndRun()
    expect(dispatch.mock.calls.map(call => (call[0] as ActionIntent).idempotencyKey)).toEqual([
      'run-1:upsert_record:1',
      'run-1:append_note:1',
    ])
  })

  it('exécute les pas dans l’ordre des dépendances', async () => {
    const { run } = await approveAndRun()
    expect(run.steps.map(s => s.key)).toEqual(['upsert_record', 'append_note'])
  })

  // #2201.43 — la capacité (jamais l'éditeur) voyage désormais de la
  // DÉFINITION du workflow jusqu'à la trace PERSISTÉE — jusqu'ici, seul le
  // catalogue la portait, aucun appelant ne la lisait sur un pas exécuté.
  it('#2201.43 — la trace persistée porte la capacité du pas, recopiée de la définition', async () => {
    const { run } = await approveAndRun()
    expect(run.steps.map(s => s.capability)).toEqual(['crm', 'crm'])
  })

  it('D7 — les pas s’écrivent AU FIL de l’exécution : le premier est en base avant que le second parte', async () => {
    const harness = build()
    const seenAtSecondDispatch: number[] = []
    harness.dispatch.mockImplementation(async () => {
      if (harness.dispatch.mock.calls.length === 2) {
        const progress = harness.runs.update.mock.calls
          .map(call => (call[1] as { steps?: unknown[] }).steps)
          .filter((steps): steps is unknown[] => Array.isArray(steps))
        seenAtSecondDispatch.push(progress.at(-1)?.length ?? 0)
      }
      return { type: 'create_crm_note', status: 'done', externalRef: 'x1' }
    })
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      definition_key: 'crm_hygiene',
      correlation_id: 'c',
      steps: [],
      intents: PERSISTED,
    })
    await harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' })
    expect(seenAtSecondDispatch).toEqual([1])
  })

  it('saute — et ne fait PAS échouer — le pas dont la dépendance n’a pas abouti', async () => {
    const dispatch = jest
      .fn()
      .mockResolvedValueOnce({ type: 'create_crm_task', status: 'failed', reason: 'CRM indisponible' })
    const { run } = await approveAndRun({ dispatch })
    expect(run.steps[0].outcome).toBe('failed')
    expect(run.steps[1].outcome).toBe('skipped')
    expect(run.steps[1].reason).toContain('upsert_record')
    expect(run.status).toBe('failed')
  })

  it('s’arrête sur un état inconnu au lieu de rejouer un envoi peut-être parti', async () => {
    const dispatch = jest.fn().mockResolvedValueOnce({ type: 'create_crm_task', status: 'unknown' })
    const { run, dispatch: spy } = await approveAndRun({ dispatch })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(run.steps).toHaveLength(1)
    expect(run.steps[0].outcome).toBe('unknown')
  })

  it('libère les crédits réservés quand la demande est refusée', async () => {
    const harness = build()
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      correlation_id: 'corr-1',
      intents: null,
    })
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'reject',
    })
    expect(run.status).toBe('cancelled')
    expect(harness.reservations.settle).toHaveBeenCalledWith('ws-1', 'corr-1', 'released')
    expect(harness.dispatch).not.toHaveBeenCalled()
  })

  it('balaie les réservations mortes de l’espace AVANT d’en poser une nouvelle', async () => {
    const harness = build()
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      correlation_id: 'corr-1',
      definition_key: 'signal_to_account_opening',
      steps: [],
      intents: { enrich_decision_maker: { type: 'enrich_contact', contactId: noteIntent.contactId } },
    })
    await harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' })

    const sweep = harness.reservations.sweepExpired as jest.Mock
    const reserve = harness.reservations.reserve as jest.Mock
    expect(sweep).toHaveBeenCalledWith('ws-1')
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(sweep.mock.invocationCallOrder[0]).toBeLessThan(reserve.mock.invocationCallOrder[0] as number)
  })

  it('I4 / D3 — « dépensé » est le débit RAPPORTÉ, jamais l’estimation du pas', async () => {
    const harness = build({
      dispatch: jest.fn().mockResolvedValue({ type: 'enrich_contact', status: 'done', creditsDebited: 0 }),
    })
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      correlation_id: 'corr-1',
      definition_key: 'signal_to_account_opening',
      steps: [],
      intents: { enrich_decision_maker: { type: 'enrich_contact', contactId: noteIntent.contactId } },
    })
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'approve',
    })
    expect(run.steps.find(step => step.key === 'enrich_decision_maker')?.creditsSpent).toBe(0)
    expect(run.spent_credits).toBe(0)
    // I3 — rien débité : la réservation est LIBÉRÉE, jamais « consommée » d'office.
    expect(harness.reservations.settle).toHaveBeenCalledWith('ws-1', 'corr-1', 'released')
    expect(harness.reservations.settle).not.toHaveBeenCalledWith('ws-1', 'corr-1', 'consumed')
    // #2855 — le pas dispatché porte la provenance du RUN qui l'exécute.
    expect(harness.dispatch.mock.calls[0][2]).toMatchObject({ source: { kind: 'routine', ref: 'run-1' } })
  })

  it('#2440.98 (épopée #2975) — job interrompu (pas « inconnu ») : le run s’arrête et la réservation encore ouverte est LIBÉRÉE, jamais laissée en l’air', async () => {
    // Le pas revient « inconnu » (délai dépassé, envoi peut-être parti) SANS
    // passer par un worker qui soldera lui-même (`mode !== 'queued'`) : c'est
    // le cas d'une interruption qui n'a personne d'autre pour reconcilier.
    const harness = build({
      dispatch: jest.fn().mockResolvedValue({ type: 'enrich_contact', status: 'unknown' }),
    })
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      correlation_id: 'corr-1',
      definition_key: 'signal_to_account_opening',
      steps: [],
      intents: { enrich_decision_maker: { type: 'enrich_contact', contactId: noteIntent.contactId } },
    })
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'approve',
    })
    // Le run s'arrête sur l'état inconnu : aucun pas suivant n'est tenté.
    expect(run.status).toBe('unknown')
    expect(run.steps).toHaveLength(1)
    expect(run.steps[0]?.outcome).toBe('unknown')
    // La réservation posée pour ce pas est réconciliée à « released » — jamais
    // « consumed » d'office (I4), et jamais laissée « reserved » indéfiniment.
    expect(harness.reservations.settle).toHaveBeenCalledWith('ws-1', 'corr-1', 'released')
    expect(harness.reservations.settle).not.toHaveBeenCalledWith('ws-1', 'corr-1', 'consumed')
  })

  it('#4119 — une EXCEPTION du routeur en plein run libère la réservation (sans attendre l’expiration à 30 min), et remonte', async () => {
    const harness = build({ dispatch: jest.fn().mockRejectedValue(new Error('routeur en panne')) })
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      correlation_id: 'corr-1',
      definition_key: 'signal_to_account_opening',
      steps: [],
      intents: { enrich_decision_maker: { type: 'enrich_contact', contactId: noteIntent.contactId } },
    })
    await expect(
      harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' }),
    ).rejects.toThrow('routeur en panne')
    const settles = (harness.reservations.settle as jest.Mock).mock.calls.filter(call => call[1] === 'corr-1')
    expect(settles).toEqual([['ws-1', 'corr-1', 'released']])
  })

  it('#4119 — une recherche déjà confiée au worker n’est PAS libérée par une exception ultérieure : le worker soldera', async () => {
    const harness = build({
      dispatch: jest.fn().mockResolvedValue({ type: 'enrich_contact', status: 'queued', externalRef: 'enrich-c1' }),
    })
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      correlation_id: 'corr-1',
      definition_key: 'card_enrich_contact',
      steps: [],
      intents: { effect: { type: 'enrich_contact', contactId: noteIntent.contactId, mode: 'queued' } },
    })
    // On casse l'écriture des pas (`steps` non vide), qui vient APRÈS le dispatch.
    harness.runs.update.mockImplementation(async (_where: unknown, patch: { steps?: unknown[] }) => {
      if (patch?.steps && patch.steps.length > 0) throw new Error('db down')
      return { affected: 1 }
    })
    await expect(
      harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' }),
    ).rejects.toThrow('db down')
    expect(harness.reservations.settle).not.toHaveBeenCalled()
  })

  it('I6 / D5 — en démonstration, aucune réservation', async () => {
    const harness = build({ demo: true })
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      correlation_id: 'corr-1',
      definition_key: 'signal_to_account_opening',
      steps: [],
      intents: { enrich_decision_maker: { type: 'enrich_contact', contactId: noteIntent.contactId } },
    })
    await harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' })
    expect(harness.reservations.reserve).not.toHaveBeenCalled()
  })

  it('D6 — un pas EN FILE laisse le run « en cours » : pas de fin, pas de solde de réservation', async () => {
    const harness = build({
      dispatch: jest.fn().mockResolvedValue({ type: 'enrich_contact', status: 'queued', externalRef: 'enrich-c1' }),
    })
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      correlation_id: 'corr-1',
      definition_key: 'card_enrich_contact',
      steps: [],
      intents: { effect: { type: 'enrich_contact', contactId: noteIntent.contactId, mode: 'queued' } },
    })
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'approve',
    })
    expect(run.status).toBe('running')
    expect(run.finished_at).toBeNull()
    // La réservation est confiée au worker de la recherche, avec sa référence.
    expect(harness.dispatch.mock.calls[0][2]).toEqual({
      source: { kind: 'routine', ref: 'run-1' },
      reservationReference: 'corr-1',
    })
    expect(harness.reservations.settle).not.toHaveBeenCalled()
  })

  it('refuse une demande expirée plutôt que de l’accorder à l’aveugle', async () => {
    const harness = build()
    harness.approvals.findOne.mockResolvedValue(pendingApproval({ expires_at: new Date(Date.now() - 60_000) }))
    await expect(
      harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' }),
    ).rejects.toThrow(/expirée/i)
  })

  it('refuse une validation responsable demandée par son propre auteur', async () => {
    const harness = build({ role: 'owner' })
    harness.approvals.findOne.mockResolvedValue(pendingApproval({ required_level: 'n3_manager_approval' }))
    await expect(
      harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' }),
    ).rejects.toThrow(/demandeur/i)
  })

  /**
   * D3 (revue de sécurité, 13/09) — `decideApprovalRequest` lisait `pending` puis
   * écrivait sans condition : deux validations simultanées passaient toutes deux, et
   * une carte que son auteur annulait pendant la validation d'un responsable partait
   * quand même. La demande et le run se RÉCLAMENT désormais atomiquement.
   */
  it('D3 (revue) — la demande se RÉCLAME atomiquement : une seconde validation ne relance rien', async () => {
    const harness = build()
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      status: 'awaiting_approval',
      definition_key: 'crm_hygiene',
      correlation_id: 'wf_crm_hygiene_x',
      steps: [],
      intents: PERSISTED,
    })
    harness.approvals.update.mockResolvedValue({ affected: 0 })
    // #1959.12 — la réclamation perdue ne relance RIEN (l'invariant de sécurité
    // de D3, intact) et rend le run RÉEL plutôt qu'une erreur 400.
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'approve',
    })
    expect(run.id).toBe('run-1')
    expect(harness.approvals.update).toHaveBeenCalledWith(
      { id: 'ap-1', workspace_id: 'ws-1', state: 'pending' },
      expect.objectContaining({ state: 'approved' }),
    )
    expect(harness.dispatch).not.toHaveBeenCalled()
  })

  /**
   * #1959.12 — LE SECOND VALIDATEUR VOIT LE RÉSULTAT, PAS UNE ERREUR.
   *
   * Deux responsables ouvrent la même demande ; le premier valide, le second
   * clique une seconde plus tard. Il recevait `400 Demande déjà « approved »` —
   * un message d'échec pour une action qui a RÉUSSI, et aucune trace de ce qui
   * s'est passé. Rien ne doit se réexécuter (c'est l'invariant), mais ce qui a
   * eu lieu doit se LIRE : on rend le run tel qu'il est.
   */
  it('#1959.12 — une demande DÉJÀ tranchée rend le run réel au second validateur, jamais une erreur', async () => {
    const harness = build()
    harness.approvals.findOne.mockResolvedValue(pendingApproval({ state: 'approved', decided_by: 'user-9' }))
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      status: 'done',
      definition_key: 'crm_hygiene',
      correlation_id: 'wf_crm_hygiene_x',
      steps: [],
      intents: PERSISTED,
    })

    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'approve',
    })

    expect(run.status).toBe('done')
    // Rien n'est retranché, rien n'est réexécuté : l'invariant tient.
    expect(harness.approvals.update).not.toHaveBeenCalled()
    expect(harness.dispatch).not.toHaveBeenCalled()
  })

  it('#1959.12 — n’attrape pas ce qu’elle ne vise pas : une demande EXPIRÉE reste une erreur explicite', async () => {
    // Le témoin du voisin légitime. Une demande expirée n'a été tranchée par
    // PERSONNE : rendre le run ferait lire « rien ne s'est passé » sans dire
    // pourquoi. Elle garde son message, qui dit quoi faire (« relancez »).
    const harness = build()
    harness.approvals.findOne.mockResolvedValue(pendingApproval({ expires_at: new Date(Date.now() - 60_000) }))
    await expect(
      harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: PRINCIPAL, decision: 'approve' }),
    ).rejects.toThrow(/expirée/i)
    expect(harness.dispatch).not.toHaveBeenCalled()
  })

  it('D3 (revue) — le run n’attend plus (annulé par son auteur entre-temps) : rien ne part', async () => {
    const harness = build()
    harness.approvals.findOne.mockResolvedValue(pendingApproval())
    const cancelled = {
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      status: 'cancelled',
      definition_key: 'crm_hygiene',
      correlation_id: 'wf_crm_hygiene_x',
      steps: [],
      intents: PERSISTED,
    }
    harness.runs.findOne.mockResolvedValue(cancelled)
    harness.runs.update.mockResolvedValueOnce({ affected: 0 })
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'approve',
    })
    expect(harness.runs.update.mock.calls[0]).toEqual([
      { id: 'run-1', workspace_id: 'ws-1', status: 'awaiting_approval' },
      expect.objectContaining({ status: 'running' }),
    ])
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(run.status).toBe('cancelled')
  })

  /**
   * D1 (revue de sécurité, 13/09) — `executorFor` contrôlait `step.permission`, des
   * valeurs HORS matrice (`contacts:send`, `crm:write`) : `safeParse` échouait et
   * l'auteur n'était jamais vérifié. Le droit d'un pas est celui de son INTENT.
   */
  it('D1 — un responsable valide : l’AUTEUR sans le droit de l’effet (`messages:send`) ne fait rien partir', async () => {
    const harness = build({ role: 'owner' })
    const MANAGER = { userId: 'mgr', email: 'lead@esn.fr' }
    ;(harness.workspaceContext.resolveActiveWorkspace as jest.Mock).mockImplementation(async (userId: string) => ({
      workspaceId: 'ws-1',
      role: userId === MANAGER.userId ? 'owner' : 'recruiter',
    }))
    ;(harness.workspaceContext as unknown as { extraPermissionsOf: jest.Mock }).extraPermissionsOf = jest
      .fn()
      .mockResolvedValue([])
    harness.approvals.findOne.mockResolvedValue(pendingApproval({ required_level: 'n3_manager_approval' }))
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      definition_key: 'meeting_follow_up',
      correlation_id: 'wf_meeting_follow_up_x',
      started_at: null,
      steps: [],
      intents: {
        log_meeting_note: noteIntent,
        send_recap: { type: 'send_email', contactId: noteIntent.contactId },
      },
    })
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: MANAGER,
      decision: 'approve',
    })
    expect(run.status).toBe('blocked')
    expect(harness.dispatch).not.toHaveBeenCalled()
  })

  it('D1 — témoin : un droit accordé EN PROPRE à l’auteur suffit, et le run part en son nom', async () => {
    const harness = build({ role: 'owner' })
    const MANAGER = { userId: 'mgr', email: 'lead@esn.fr' }
    ;(harness.workspaceContext.resolveActiveWorkspace as jest.Mock).mockImplementation(async (userId: string) => ({
      workspaceId: 'ws-1',
      role: userId === MANAGER.userId ? 'owner' : 'recruiter',
    }))
    ;(harness.workspaceContext as unknown as { extraPermissionsOf: jest.Mock }).extraPermissionsOf = jest
      .fn()
      .mockResolvedValue(['messages:send'])
    harness.approvals.findOne.mockResolvedValue(pendingApproval({ required_level: 'n3_manager_approval' }))
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      definition_key: 'meeting_follow_up',
      correlation_id: 'wf_meeting_follow_up_x',
      started_at: null,
      steps: [],
      intents: {
        log_meeting_note: noteIntent,
        send_recap: { type: 'send_email', contactId: noteIntent.contactId },
      },
    })
    await harness.service.decideApprovalRequest({ approvalId: 'ap-1', principal: MANAGER, decision: 'approve' })
    // `send_recap` dépend de la note : les deux partent, au nom de l'auteur.
    expect(harness.dispatch).toHaveBeenCalledTimes(2)
    expect(harness.dispatch.mock.calls.map(call => (call[1] as { userId: string }).userId)).toEqual([
      PRINCIPAL.userId,
      PRINCIPAL.userId,
    ])
  })
})

describe('statut d’un run', () => {
  const step = (outcome: string) => ({ outcome }) as never

  it('« partiel » quand une partie est passée et une autre non', () => {
    expect(runStatusFrom([step('done'), step('failed')])).toBe('partial')
  })

  it('« échoué » quand rien n’est passé', () => {
    expect(runStatusFrom([step('failed'), step('failed')])).toBe('failed')
  })

  it('« fait » quand tous les pas ont abouti', () => {
    expect(runStatusFrom([step('done'), step('done')])).toBe('done')
  })

  it('« bloqué » quand tout a été sauté — jamais « fait »', () => {
    expect(runStatusFrom([step('skipped'), step('skipped')])).toBe('blocked')
  })

  it('« bloqué » quand le run n’a aucun pas', () => {
    expect(runStatusFrom([])).toBe('blocked')
  })

  it('« partiel » quand une partie est passée et qu’un pas est resté inconnu', () => {
    expect(runStatusFrom([step('done'), step('unknown')])).toBe('partial')
  })

  it('« inconnu » remonte au run quand c’est la seule issue non sautée', () => {
    expect(runStatusFrom([step('unknown'), step('skipped')])).toBe('unknown')
    expect(runStatusFrom([step('unknown'), step('unknown')])).toBe('unknown')
  })

  it('« partiel » quand des pas ont échoué ET d’autres sont inconnus', () => {
    expect(runStatusFrom([step('failed'), step('unknown')])).toBe('partial')
  })

  it('« échoué » ne reste que pour de vrais échecs', () => {
    expect(runStatusFrom([step('failed'), step('skipped')])).toBe('failed')
  })

  it('D6 — un pas EN FILE seul : « en cours », jamais « partiel »', () => {
    expect(runStatusFrom([step('queued')])).toBe('running')
    expect(runStatusFrom([step('done'), step('queued')])).toBe('running')
  })

  it('D9 — une écriture retenue par la porte CRM : le run attend quelqu’un', () => {
    expect(runStatusFrom([step('awaiting_approval')])).toBe('awaiting_approval')
    expect(runStatusFrom([step('done'), step('awaiting_approval')])).toBe('awaiting_approval')
  })
})

describe('D7 — l’étape en cours se dérive du run persisté', () => {
  const definition = findWorkflow('crm_hygiene')!

  it('le premier pas sans issue écrite quand le run tourne', () => {
    expect(
      currentStepKeyOf(definition, { status: 'running', steps: [{ key: 'upsert_record', outcome: 'done' } as never] }),
    ).toBe('append_note')
  })

  it('le pas qui attend en file, s’il y en a un', () => {
    expect(
      currentStepKeyOf(definition, {
        status: 'running',
        steps: [{ key: 'upsert_record', outcome: 'queued' } as never],
      }),
    ).toBe('upsert_record')
  })

  it('aucun quand le run ne tourne pas', () => {
    expect(currentStepKeyOf(definition, { status: 'done', steps: [] })).toBeNull()
  })
})

// #2200.21 — « prochaine action » sur une carte « À valider » : le run attend
// encore une décision (`awaiting_approval`, `blocked`), donc `currentStepKeyOf`
// (qui n'a de sens que pour `running`) rend `null`. `nextStepKeyOf` répond à une
// question différente : quel est le PREMIER pas, dans l'ordre des dépendances,
// qui n'a pas encore d'issue — quel que soit le statut, tant qu'il n'est pas
// terminal.
describe('#2200.21 — la prochaine étape se dérive même avant exécution', () => {
  const definition = findWorkflow('crm_hygiene')!

  it('le premier pas de la définition quand rien n’a encore d’issue', () => {
    expect(nextStepKeyOf(definition, { status: 'awaiting_approval', steps: [] })).toBe('upsert_record')
  })

  it('le premier pas SANS issue écrite, une fois le run entamé', () => {
    expect(
      nextStepKeyOf(definition, { status: 'running', steps: [{ key: 'upsert_record', outcome: 'done' } as never] }),
    ).toBe('append_note')
  })

  it('aucune prochaine étape une fois le run à un statut terminal', () => {
    expect(nextStepKeyOf(definition, { status: 'done', steps: [] })).toBeNull()
    expect(nextStepKeyOf(definition, { status: 'failed', steps: [] })).toBeNull()
    expect(nextStepKeyOf(definition, { status: 'cancelled', steps: [] })).toBeNull()
    expect(nextStepKeyOf(definition, { status: 'partial', steps: [] })).toBeNull()
  })
})

describe('traduction d’une issue de dispatch en issue de pas', () => {
  it('« mis en file » n’est pas « fait »', () => {
    expect(toOutcome('queued')).toBe('queued')
  })

  it('conserve les issues qui portent déjà leur vérité', () => {
    expect(toOutcome('done')).toBe('done')
    expect(toOutcome('unknown')).toBe('unknown')
    expect(toOutcome('skipped')).toBe('skipped')
    expect(toOutcome('partial')).toBe('partial')
    expect(toOutcome('cancelled')).toBe('cancelled')
    expect(toOutcome('awaiting_approval')).toBe('awaiting_approval')
  })

  it('replie ce qu’elle ne connaît pas sur l’échec, jamais sur la réussite', () => {
    expect(toOutcome('boom')).toBe('failed')
  })
})

/**
 * #1952.29 — L'ACCUSÉ DE FIN D'UN TRAVAIL LONG DE LAURA — allumé par défaut,
 * tranché Louis 16/09/2026 CONTRE la recommandation « éteint par défaut ».
 *
 * Ce que ces tests tiennent :
 *  - l'annonce part pour un travail lancé DEPUIS LA CONVERSATION (`turn_id`) ;
 *  - elle ne part PAS pour un run qui ne vient pas de Laura — le témoin, sans
 *    lequel cette garde dirait « oui » à tout ;
 *  - elle dit la VÉRITÉ du statut : un run qui n'a pas abouti ne s'annonce pas
 *    d'un « ✅ ».
 */
describe('#1952.29 — un travail long de Laura annonce sa fin', () => {
  const PERSISTED = { upsert_record: noteIntent, append_note: noteIntent }

  async function runFromConversation(over: { turnId?: string | null; dispatch?: jest.Mock } = {}) {
    const harness = build({ dispatch: over.dispatch })
    harness.approvals.findOne.mockResolvedValue({
      id: 'ap-1',
      workspace_id: 'ws-1',
      run_id: 'run-1',
      required_level: 'n2_user_approval',
      state: 'pending',
      requested_by: PRINCIPAL.userId,
      expires_at: new Date(Date.now() + 60_000),
    })
    harness.runs.findOne.mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      definition_key: 'crm_hygiene',
      correlation_id: 'wf_crm_hygiene_x',
      started_at: null,
      steps: [],
      intents: PERSISTED,
      conversation_id: 'conv-1',
      turn_id: over.turnId === undefined ? 'turn-1' : over.turnId,
      preview: {
        whatWillHappen: 'Mettre à jour la fiche de Claire Dubois',
        targetObject: 'ACME — Claire Dubois',
        destination: null,
        content: null,
        dataUsed: null,
        costCredits: 0,
        connectionUsed: null,
        whatWillNotHappen: 'aucun envoi automatique',
      },
    })
    const run = await harness.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: PRINCIPAL,
      decision: 'approve',
    })
    return { ...harness, run }
  }

  it('annonce la fin sur les canaux branchés, avec le nom du travail', async () => {
    const { run, longJobNotifier } = await runFromConversation()

    expect(run.status).toBe('done')
    expect(longJobNotifier.notifyUser).toHaveBeenCalledTimes(1)
    const [userId, event] = longJobNotifier.notifyUser.mock.calls[0]
    expect(userId).toBe(PRINCIPAL.userId)
    expect(event.type).toBe('laura.job.completed')
    expect(event.text).toContain('Mettre à jour la fiche de Claire Dubois')
    expect(event.text).toContain('✅')
    expect(event.data).toMatchObject({ runId: 'run-1', status: 'done', conversationId: 'conv-1' })
  })

  it('TÉMOIN — un run qui ne vient PAS de la conversation n’annonce rien', async () => {
    const { run, longJobNotifier } = await runFromConversation({ turnId: null })

    expect(run.status).toBe('done')
    expect(longJobNotifier.notifyUser).not.toHaveBeenCalled()
  })

  it('dit la VÉRITÉ du statut : un travail qui n’aboutit pas ne s’annonce pas d’un « ✅ »', async () => {
    const dispatch = jest.fn().mockResolvedValue({ type: 'create_crm_note', status: 'failed', error: 'refus du CRM' })
    const { run, longJobNotifier } = await runFromConversation({ dispatch })

    expect(run.status).not.toBe('done')
    expect(longJobNotifier.notifyUser).toHaveBeenCalledTimes(1)
    const [, event] = longJobNotifier.notifyUser.mock.calls[0]
    expect(event.text).not.toContain('✅')
    expect(event.data).toMatchObject({ status: run.status })
  })

  /**
   * #2276.62 — LE RÉSULTAT DU JOB REVIENT DANS LAURA, PAR LA CLOCHE EXISTANTE.
   *
   * Échec de recette du 25/09 : la notification de fin d'un job Laura menait à
   * `/mailbox`, sans aucun chemin vers le fil qui l'avait demandé. La cloche
   * (`NotificationsService.createNotification`, GA-26) et le lien de fil déjà
   * utilisé par les mentions et l'assignation de carte (`chatNotificationLink`,
   * #1940.1/#1940.7) existaient déjà ; il manquait le câblage entre les deux
   * pour un run venu de la conversation.
   */
  describe('#2276.62 — le résultat revient dans la conversation d’origine', () => {
    it('avec une conversation d’origine, la cloche pointe vers CE fil précis', async () => {
      const { jobReturnNotifier } = await runFromConversation()

      expect(jobReturnNotifier.notify).toHaveBeenCalledTimes(1)
      const [userId, input] = jobReturnNotifier.notify.mock.calls[0]
      expect(userId).toBe(PRINCIPAL.userId)
      expect(input.link).toBe('/chat?conversationId=conv-1')
      expect(input.title).toContain('Mettre à jour la fiche de Claire Dubois')
    })

    it('TÉMOIN — un run qui ne vient PAS de la conversation ne ramène rien : on garde le lien actuel', async () => {
      const { jobReturnNotifier } = await runFromConversation({ turnId: null })

      expect(jobReturnNotifier.notify).not.toHaveBeenCalled()
    })
  })
})

/**
 * #2865 — Relancer un run MULTI-PAS échoué/interrompu, à partir du pas en
 * échec — jamais un pas déjà réussi, qui a peut-être déjà écrit ; jamais un
 * pas au résultat `unknown` (doctrine : un timeout n'est pas un échec, et
 * rejouer un envoi peut-être déjà parti est pire que de ne rien faire).
 *
 * `crm_hygiene` (`upsert_record` → `append_note`, dépendant) est le même
 * workflow que « exécution après approbation » plus haut : deux pas suffisent
 * à distinguer « déjà réussi » de « à rejouer ».
 */
describe('retryResumeStepKeyOf — le pas par lequel une relance reprendrait (#2865)', () => {
  const definition = findWorkflow('crm_hygiene')!

  it('pointe le premier pas qui n’a pas réussi', () => {
    const run = {
      status: 'failed',
      steps: [
        { key: 'upsert_record', outcome: 'done' },
        { key: 'append_note', outcome: 'failed' },
      ],
    }
    expect(retryResumeStepKeyOf(definition, run as never)).toBe('append_note')
  })

  it('rend `null` quand le pas à rejouer est `unknown` — la doctrine bloque la reprise', () => {
    const run = {
      status: 'partial',
      steps: [
        { key: 'upsert_record', outcome: 'done' },
        { key: 'append_note', outcome: 'unknown' },
      ],
    }
    expect(retryResumeStepKeyOf(definition, run as never)).toBeNull()
  })

  it('rend `null` quand tous les pas ont déjà réussi — rien à relancer', () => {
    const run = {
      status: 'done',
      steps: [
        { key: 'upsert_record', outcome: 'done' },
        { key: 'append_note', outcome: 'done' },
      ],
    }
    expect(retryResumeStepKeyOf(definition, run as never)).toBeNull()
  })
})

describe('retryRun — relance manuelle d’un run multi-pas (#2865)', () => {
  const PERSISTED = { upsert_record: noteIntent, append_note: noteIntent }

  function failedRun(over: Partial<WorkflowRunEntity> = {}) {
    return {
      id: 'run-1',
      workspace_id: 'ws-1',
      user_id: PRINCIPAL.userId,
      definition_key: 'crm_hygiene',
      correlation_id: 'wf_crm_hygiene_x',
      status: 'failed',
      started_at: new Date('2026-09-24T10:00:00.000Z'),
      finished_at: new Date('2026-09-24T10:01:00.000Z'),
      intents: PERSISTED,
      steps: [
        {
          key: 'upsert_record',
          intentType: 'create_crm_task',
          outcome: 'done',
          attempts: 1,
          externalRef: 'crm-1',
          creditsSpent: 0,
          reason: null,
          startedAt: '2026-09-24T10:00:00.000Z',
          finishedAt: '2026-09-24T10:00:01.000Z',
        },
        {
          key: 'append_note',
          intentType: 'create_crm_note',
          outcome: 'failed',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: 'CRM indisponible',
          startedAt: '2026-09-24T10:00:01.000Z',
          finishedAt: '2026-09-24T10:00:02.000Z',
        },
      ],
      ...over,
    } as unknown as WorkflowRunEntity
  }

  it('ne rejoue PAS le pas déjà réussi — reprend depuis le pas en échec', async () => {
    const { service, runs, dispatch } = build()
    runs.findOne.mockResolvedValue(failedRun())

    const run = await service.retryRun('run-1', PRINCIPAL)

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'create_crm_note' })
    // La tentative REPREND le compteur du pas rejoué (1 déjà fait) : la clé de
    // dispatch est neuve, un double clic sur la même tentative ne produit rien
    // de plus (même règle que `CopilotCardService.retry`).
    expect(dispatch.mock.calls[0][0]).toMatchObject({ idempotencyKey: 'run-1:append_note:2' })
    expect(run.steps.map(s => ({ key: s.key, outcome: s.outcome }))).toEqual([
      { key: 'upsert_record', outcome: 'done' },
      { key: 'append_note', outcome: 'done' },
    ])
    // Le pas préservé garde ses PROPRES attempts — il n'a pas été retenté.
    expect(run.steps[0].attempts).toBe(1)
    expect(run.status).toBe('done')
  })

  it('un pas au résultat `unknown` BLOQUE la relance — rien ne part', async () => {
    const { service, runs, dispatch } = build()
    runs.findOne.mockResolvedValue(
      failedRun({
        status: 'partial',
        steps: [
          {
            key: 'upsert_record',
            intentType: 'create_crm_task',
            outcome: 'done',
            attempts: 1,
            externalRef: 'crm-1',
            creditsSpent: 0,
            reason: null,
            startedAt: '2026-09-24T10:00:00.000Z',
            finishedAt: '2026-09-24T10:00:01.000Z',
          },
          {
            key: 'append_note',
            intentType: 'create_crm_note',
            outcome: 'unknown',
            attempts: 1,
            externalRef: null,
            creditsSpent: 0,
            reason: null,
            startedAt: '2026-09-24T10:00:01.000Z',
            finishedAt: null,
          },
        ],
      } as never),
    )

    await expect(service.retryRun('run-1', PRINCIPAL)).rejects.toThrow(/inconnu/i)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('refuse un run `blocked` — rien n’est parti, le geste est de brancher un outil, pas de rejouer', async () => {
    const { service, runs, dispatch } = build()
    runs.findOne.mockResolvedValue(failedRun({ status: 'blocked', steps: [] } as never))

    await expect(service.retryRun('run-1', PRINCIPAL)).rejects.toThrow(/ne se relance pas/i)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('refuse un run dont tous les pas ont déjà réussi — rien à relancer', async () => {
    const { service, runs, dispatch } = build()
    runs.findOne.mockResolvedValue(
      failedRun({
        status: 'partial',
        steps: [
          {
            key: 'upsert_record',
            intentType: 'create_crm_task',
            outcome: 'done',
            attempts: 1,
            externalRef: 'crm-1',
            creditsSpent: 0,
            reason: null,
            startedAt: '2026-09-24T10:00:00.000Z',
            finishedAt: '2026-09-24T10:00:01.000Z',
          },
          {
            key: 'append_note',
            intentType: 'create_crm_note',
            outcome: 'done',
            attempts: 1,
            externalRef: 'note-1',
            creditsSpent: 0,
            reason: null,
            startedAt: '2026-09-24T10:00:01.000Z',
            finishedAt: '2026-09-24T10:00:02.000Z',
          },
        ],
      } as never),
    )

    await expect(service.retryRun('run-1', PRINCIPAL)).rejects.toThrow(/rien à relancer/i)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
