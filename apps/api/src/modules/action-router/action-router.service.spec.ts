/**
 * ActionRouterService — dispatch reco → executed action over the capabilities on
 * `main`. Each intent must route to the RIGHT existing service (mocked); a tool
 * that isn't connected must yield an explicit `skipped` (never a silent no-op or
 * fake); enrich must debit a credit via the reused ContactsService; bulk must
 * aggregate best-effort; and every dispatch must write the shared journal.
 */
import { crmTaskProviderSchema, workspaceRuleForbids } from '@bellum/contracts'
import type { WorkspaceRole, WorkspaceRuleGesture } from '@bellum/contracts'
import { failure, success } from '@bellum/utils'
import { connectorMessage, scopeMissing } from '../../common/connector-error'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import type { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { ContactsService } from '../contacts/contacts.service'
import type { CrmService } from '../crm/crm.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ActionRouterService, DEBIT_NOT_REPORTED, type ActionPrincipal } from './action-router.service'
import { crmWritesPortFrom, type ActionRouterPorts } from './card-effect-ports'
import { CrmWriteService } from '../crm/crm-write.service'

type CrmDoorDouble = { getStatus: jest.Mock; exportContact: jest.Mock }

/**
 * #4186 — la VRAIE porte commune (`CrmWriteService`), sur des doubles de
 * fournisseurs (`doors`) et une porte d'écriture (`gate`) en mémoire. Sans
 * `gate`, la file se comporte comme `OutboundWriteService` : `user` part,
 * `system` attend.
 */
function realCrmWrites(doors: Record<string, CrmDoorDouble | undefined>, gate?: { request: jest.Mock }) {
  const registry = {
    get: (provider: string) => {
      const door = doors[provider]
      return door
        ? {
            provider,
            status: (userId: string) => door.getStatus(userId),
            upsertContact: (userId: string, input: unknown) => door.exportContact(userId, input),
          }
        : null
    },
  }
  const outbound = {
    request: jest.fn(async (input: { origin: 'user' | 'system' }) => {
      const verdict = gate
        ? await gate.request(input)
        : { decision: input.origin === 'user' ? 'write_now' : 'pending', requestId: 'owr-auto' }
      return {
        decision: verdict.decision,
        request: { id: verdict.requestId, state: 'approved', provider_response: null },
      }
    }),
    recordOutcome: jest.fn().mockResolvedValue(undefined),
    recordUnknown: jest.fn().mockResolvedValue(undefined),
  }
  const workspace = {
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
  }
  return crmWritesPortFrom(new CrmWriteService(registry as never, outbound as never, workspace as never, {} as never))
}

const principal: ActionPrincipal = { userId: 'user-1', email: 'rep@esn.fr' }

const contact = {
  id: 'c1',
  account_id: 'acc1',
  full_name: 'Jean Dupont',
  entity: 'Acme Group',
  title: 'DSI',
  email: 'jean@corp.fr',
  phone: '0102030405',
  linkedin_url: 'https://linkedin.com/in/jd',
} as ContactEntity

function build(
  options: {
    calendarConnected?: boolean
    demo?: boolean
    ports?: ActionRouterPorts
    /** #4186 — les fournisseurs (en plus de Salesforce) et la porte d'écriture derrière `crmWrites`. */
    crm?: { doors?: Record<string, CrmDoorDouble>; gate?: { request: jest.Mock } }
    role?: string
    /** Les permissions accordées EN PROPRE au membre (`workspace_member_permissions`). */
    extra?: string[]
    /** #2081.14 — la règle d'espace « qui peut exporter ». */
    exportPolicy?: 'everyone' | 'admins'
  } = {},
) {
  const contacts = {
    sendEmail: jest.fn(),
    enrichContact: jest.fn(),
    findOwnedForAction: jest.fn(),
    updateStatus: jest.fn(),
  }
  const crm = {
    getStatus: jest.fn().mockResolvedValue({ configured: true, connected: true }),
    exportContact: jest.fn().mockResolvedValue({ id: 'hs-42', created: true }),
    logActivity: jest.fn().mockResolvedValue({ id: 'note-1' }),
    // #2319.114 — clôture une tâche déjà créée, MÊME porte que le reste.
    closeTask: jest.fn().mockResolvedValue({ id: 'hs-42' }),
    // Recherche de la fiche existante : par défaut le contact EST dans le CRM,
    // pour que le cas nominal de la note n'ait pas besoin d'un identifiant.
    findPresence: jest.fn().mockResolvedValue({
      provider: 'hubspot',
      matched: true,
      contactsCount: 1,
      contacts: [{ id: 'hs-found', name: 'Jean Dupont', email: 'jean@corp.fr', jobTitle: 'DSI' }],
      openDeals: [],
      lastActivityAt: null,
    }),
  }
  const salesforce = {
    getStatus: jest.fn().mockResolvedValue({ configured: true, connected: true }),
    exportContact: jest.fn().mockResolvedValue({ id: 'sf-99', created: false }),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: options.role ?? 'owner' }),
    // I6 (#1931 L2) — le routeur demande si l'espace est une salle de démonstration
    // avant toute écriture vers un outil externe.
    isDemoWorkspace: jest.fn().mockResolvedValue(options.demo ?? false),
    extraPermissionsOf: jest.fn().mockResolvedValue(options.extra ?? []),
    // #2081.14 — la VRAIE décision du contrat, sur la règle d'espace du test.
    workspaceRuleRefusing: jest.fn(async (_workspaceId: string, role: WorkspaceRole, gesture: WorkspaceRuleGesture) =>
      workspaceRuleForbids({ exportPolicy: options.exportPolicy ?? 'everyone' }, role, gesture),
    ),
  }
  const userActions = createMockRepository<UserActionEntity>()
  // Journal writes get a real id so `externalRef` resolves to the row id.
  userActions.save.mockImplementation(async (e: Partial<UserActionEntity>) => ({ id: 'ua-1', ...e }))
  const accounts = createMockRepository<AccountEntity>()
  // #2771 — `stop_sequence` : dépôts directs (jamais `OutreachModule`, voir le service).
  const outreachSequences = createMockRepository<OutreachSequenceEntity>()
  const outreachSequenceSteps = createMockRepository<OutreachSequenceStepEntity>()
  // Un agenda BRANCHÉ mais non connecté par défaut : c'est l'état du plus grand
  // nombre, et c'est celui où le rappel doit retomber sur le journal interne.
  const calendar = {
    key: 'test-calendar',
    isConnected: jest.fn().mockResolvedValue(options.calendarConnected ?? false),
    createEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
  }
  const notifier = { notify: jest.fn().mockResolvedValue({ id: 'notif-1' }) }

  const service = new ActionRouterService(
    contacts as unknown as ContactsService,
    crm as unknown as CrmService,
    workspaceContext as unknown as WorkspaceContextService,
    userActions as never,
    accounts as never,
    [calendar],
    notifier,
    // #4186 — la porte commune, sur Salesforce par défaut ; `ports: {}` = aucune porte branchée.
    options.ports ?? { crmWrites: realCrmWrites({ salesforce, ...options.crm?.doors }, options.crm?.gate) },
    outreachSequences as never,
    outreachSequenceSteps as never,
  )
  return {
    service,
    contacts,
    crm,
    salesforce,
    workspaceContext,
    userActions,
    accounts,
    calendar,
    notifier,
    outreachSequences,
    outreachSequenceSteps,
  }
}

describe('ActionRouterService.dispatch', () => {
  describe('send_email', () => {
    it('routes to ContactsService.sendEmail and returns done + externalRef', async () => {
      const { service, contacts } = build()
      contacts.sendEmail.mockResolvedValueOnce(
        success({ contact_id: 'c1', sent_to: 'jean@corp.fr', email_sent_at: '2026-07-16T00:00:00.000Z' }),
      )

      const res = await service.dispatch({ type: 'send_email', contactId: 'c1' }, principal)

      expect(contacts.sendEmail).toHaveBeenCalledWith('c1', 'user-1', 'rep@esn.fr')
      expect(res).toEqual({ type: 'send_email', status: 'done', externalRef: 'c1' })
    })

    it('maps a soft send failure (already_sent) to skipped, not failed', async () => {
      const { service, contacts } = build()
      contacts.sendEmail.mockResolvedValueOnce(failure({ code: 'already_sent', message: 'déjà envoyé' }))

      const res = await service.dispatch({ type: 'send_email', contactId: 'c1' }, principal)

      expect(res.status).toBe('skipped')
      expect(res.reason).toBe('déjà envoyé')
    })

    it('maps a transport error (send_failed) to failed', async () => {
      const { service, contacts } = build()
      contacts.sendEmail.mockResolvedValueOnce(failure({ code: 'send_failed', message: 'Resend rejeté' }))

      const res = await service.dispatch({ type: 'send_email', contactId: 'c1' }, principal)

      expect(res.status).toBe('failed')
    })
  })

  describe('enrich_contact', () => {
    it('resolves the owned contact, calls ContactsService.enrichContact (which debits a credit), and journals', async () => {
      const { service, contacts, userActions } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
      contacts.enrichContact.mockResolvedValueOnce(success({ ...contact, enrichment: {}, credits_remaining: 74 }))

      const res = await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal)

      // Credit consumption is reused via ContactsService.enrichContact — the router
      // derives Apollo's match keys server-side from the owned contact.
      expect(contacts.enrichContact).toHaveBeenCalledWith('c1', 'user-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'Acme Group',
      })
      expect(res.status).toBe('done')
      // Journal line written (enrichContact itself doesn't feed the activity log).
      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'plan_action_enrichment_requested', contact_id: 'c1' }),
      )
      expect(userActions.save).toHaveBeenCalled()
    })

    it('falls back to the account company_name when the contact has no entity', async () => {
      const { service, contacts, accounts } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success({ ...contact, entity: null } as ContactEntity))
      accounts.findOne.mockResolvedValueOnce({ company_name: 'Acme SA' } as AccountEntity)
      contacts.enrichContact.mockResolvedValueOnce(success({ ...contact, enrichment: {}, credits_remaining: 1 }))

      await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal)

      expect(contacts.enrichContact).toHaveBeenCalledWith(
        'c1',
        'user-1',
        expect.objectContaining({ organization_name: 'Acme SA' }),
      )
    })

    it('maps insufficient_credits to skipped (soft precondition)', async () => {
      const { service, contacts } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
      contacts.enrichContact.mockResolvedValueOnce(
        failure({ code: 'insufficient_credits', message: 'Crédits épuisés.' }),
      )

      const res = await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal)

      expect(res.status).toBe('skipped')
    })

    it('skips (and never calls enrich) when the contact is not owned', async () => {
      const { service, contacts } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(failure({ code: 'not_found', message: 'introuvable' }))

      const res = await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal)

      expect(res.status).toBe('skipped')
      expect(contacts.enrichContact).not.toHaveBeenCalled()
    })
  })

  describe('create_crm_task', () => {
    it('exports to HubSpot, logs the note on the timeline, journals, and returns done', async () => {
      const { service, contacts, crm, userActions } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

      const res = await service.dispatch(
        { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot', note: 'Relancer après POC' },
        principal,
      )

      expect(crm.exportContact).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          email: 'jean@corp.fr',
          firstName: 'Jean',
          lastName: 'Dupont',
          company: 'Acme Group',
        }),
        // D9 — l'origine d'écriture atteint la porte (un clic = `user`).
        { origin: 'user', source: null },
      )
      expect(crm.logActivity).toHaveBeenCalledWith('user-1', 'hs-42', expect.stringContaining('Relancer après POC'), {
        origin: 'user',
        source: null,
      })
      expect(res).toEqual({ type: 'create_crm_task', status: 'done', externalRef: 'hs-42' })
      expect(userActions.create).toHaveBeenCalledWith(expect.objectContaining({ action_type: 'crm_task_created' }))
    })

    // #2855 — la PROVENANCE déclarée par l'appelant (`WorkflowRunnerService`)
    // atteint la porte, distincte de `origin` : une carte proposée par une
    // routine et validée d'un clic reste `origin: 'user'`.
    it('transmet la provenance déclarée par l’appelant jusqu’à la porte CRM', async () => {
      const { service, contacts, crm } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

      await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' }, principal, {
        source: { kind: 'routine', ref: 'wf-run-1' },
      })

      expect(crm.exportContact).toHaveBeenCalledWith('user-1', expect.anything(), {
        origin: 'user',
        source: { kind: 'routine', ref: 'wf-run-1' },
      })
    })

    it('routes a salesforce task to SalesforceService.exportContact', async () => {
      const { service, contacts, salesforce, crm } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

      const res = await service.dispatch(
        { type: 'create_crm_task', contactId: 'c1', crmProvider: 'salesforce' },
        principal,
      )

      expect(salesforce.exportContact).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ email: 'jean@corp.fr' }),
      )
      expect(crm.exportContact).not.toHaveBeenCalled()
      expect(res).toEqual({ type: 'create_crm_task', status: 'done', externalRef: 'sf-99' })
    })

    it('skips with a clear reason when the CRM is not connected — and never exports', async () => {
      const { service, contacts, crm } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
      crm.getStatus.mockResolvedValueOnce({ configured: true, connected: false })

      const res = await service.dispatch(
        { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' },
        principal,
      )

      expect(res.status).toBe('skipped')
      expect(res.reason).toContain('non connecté')
      expect(crm.exportContact).not.toHaveBeenCalled()
    })

    it('returns failed when the CRM export throws (best-effort, never leaks)', async () => {
      const { service, contacts, crm } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
      crm.exportContact.mockRejectedValueOnce(new Error('HubSpot 500'))

      const res = await service.dispatch(
        { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' },
        principal,
      )

      expect(res.status).toBe('failed')
      expect(res.reason).toContain('HubSpot 500')
    })
  })

  describe('schedule_reminder (degrades to an internal reminder)', () => {
    it('persists a dated reminder row in the journal and returns done', async () => {
      const { service, contacts, userActions } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

      const res = await service.dispatch(
        { type: 'schedule_reminder', contactId: 'c1', at: '2026-08-01T09:00:00.000Z', note: 'Rappel POC' },
        principal,
      )

      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'plan_action_added',
          contact_id: 'c1',
          metadata: expect.objectContaining({ remind_at: '2026-08-01T09:00:00.000Z', source: 'internal_reminder' }),
        }),
      )
      expect(res.status).toBe('done')
      expect(res.reason).toContain('aucun agenda connecté')
      expect(res.externalRef).toBe('ua-1')
    })

    /**
     * A « besoin » belongs to a company, not to a person (restitution V2 §7) — so
     * the reminder must be able to hang on the ACCOUNT, with its ownership
     * re-resolved from the caller's workspace and never from the body.
     */
    it('accepts an account-scoped reminder and scopes the account to the workspace', async () => {
      const { service, contacts, accounts, userActions } = build()
      accounts.findOne.mockResolvedValueOnce({ id: 'acc1', company_name: 'Acme', status: 'completed' })

      const res = await service.dispatch(
        { type: 'schedule_reminder', accountId: 'acc1', at: '2026-08-01T09:00:00.000Z', note: 'Rappel besoin ERP' },
        principal,
      )

      expect(accounts.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'acc1', workspace_id: 'ws-1' } }),
      )
      expect(contacts.findOwnedForAction).not.toHaveBeenCalled()
      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc1',
          contact_id: null,
          metadata: expect.objectContaining({ detail: 'Rappel besoin ERP', remind_at: '2026-08-01T09:00:00.000Z' }),
        }),
      )
      expect(res.status).toBe('done')
    })

    it('skips (never writes) when the account is outside the caller workspace', async () => {
      const { service, accounts, userActions } = build()
      accounts.findOne.mockResolvedValueOnce(null)

      const res = await service.dispatch(
        { type: 'schedule_reminder', accountId: 'acc-other', at: '2026-08-01T09:00:00.000Z' },
        principal,
      )

      expect(res).toEqual({
        type: 'schedule_reminder',
        status: 'skipped',
        reason: 'Compte introuvable dans votre espace de travail.',
      })
      expect(userActions.save).not.toHaveBeenCalled()
    })

    it('skips a target-less reminder even if the schema were bypassed', async () => {
      const { service, userActions } = build()

      const res = await service.dispatch({ type: 'schedule_reminder', at: '2026-08-01T09:00:00.000Z' }, principal)

      expect(res.status).toBe('skipped')
      expect(userActions.save).not.toHaveBeenCalled()
    })
  })

  describe('snooze (updates the action state)', () => {
    it('stamps snoozed_until onto the target action and saves it', async () => {
      const { service, userActions } = build()
      const target = { id: 'ua-7', metadata: { label: 'Rappel' } } as unknown as UserActionEntity
      userActions.findOne.mockResolvedValueOnce(target)

      const res = await service.dispatch(
        { type: 'snooze', targetId: 'ua-7', until: '2026-08-10T09:00:00.000Z' },
        principal,
      )

      expect(userActions.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ua-7',
          metadata: expect.objectContaining({ snoozed_until: '2026-08-10T09:00:00.000Z' }),
        }),
      )
      expect(res).toEqual({ type: 'snooze', status: 'done', externalRef: 'ua-7' })
    })

    it('skips when the target action is not found', async () => {
      const { service, userActions } = build()
      userActions.findOne.mockResolvedValueOnce(null)

      const res = await service.dispatch(
        { type: 'snooze', targetId: 'ua-x', until: '2026-08-10T09:00:00.000Z' },
        principal,
      )

      expect(res.status).toBe('skipped')
    })
  })

  // #2277.33 / épopée #2771 — `cancel_reminder` ANNULE, `snooze` REPORTE :
  // même ligne `user_actions` ciblée par `targetId`, sémantique distincte.
  describe('cancel_reminder (rollback #2771)', () => {
    it('stamps cancelled_at onto the target action and saves it', async () => {
      const { service, userActions } = build()
      const target = { id: 'ua-9', metadata: { label: 'Rappel', status: 'Programmé' } } as unknown as UserActionEntity
      userActions.findOne.mockResolvedValueOnce(target)

      const res = await service.dispatch({ type: 'cancel_reminder', targetId: 'ua-9' }, principal)

      expect(userActions.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ua-9',
          metadata: expect.objectContaining({ cancelled_at: expect.any(String), status: 'Annulé' }),
        }),
      )
      expect(res).toEqual({ type: 'cancel_reminder', status: 'done', externalRef: 'ua-9' })
    })

    it('skips when the target action is not found', async () => {
      const { service, userActions } = build()
      userActions.findOne.mockResolvedValueOnce(null)

      const res = await service.dispatch({ type: 'cancel_reminder', targetId: 'ua-x' }, principal)

      expect(res).toEqual({ type: 'cancel_reminder', status: 'skipped', reason: 'Rappel introuvable.' })
      expect(userActions.save).not.toHaveBeenCalled()
    })

    it('skips (no-op) when the target is already cancelled — a correction never re-fires', async () => {
      const { service, userActions } = build()
      const target = {
        id: 'ua-9',
        metadata: { label: 'Rappel', cancelled_at: '2026-08-09T09:00:00.000Z', status: 'Annulé' },
      } as unknown as UserActionEntity
      userActions.findOne.mockResolvedValueOnce(target)

      const res = await service.dispatch({ type: 'cancel_reminder', targetId: 'ua-9' }, principal)

      expect(res).toEqual({ type: 'cancel_reminder', status: 'skipped', reason: 'Ce rappel est déjà annulé.' })
      expect(userActions.save).not.toHaveBeenCalled()
    })
  })

  // #2277.37 / épopée #2771 — arrêt MANUEL, distinct de `stopSequencesFor`
  // (mailer/suppression.service.ts) qui n'agit que sur opt-out/rebond.
  describe('stop_sequence (rollback #2771)', () => {
    it('cancels an active sequence and skips its remaining pending steps', async () => {
      const { service, outreachSequences, outreachSequenceSteps } = build()
      const sequence = { id: 'seq-1', user_id: 'user-1', status: 'active' } as OutreachSequenceEntity
      outreachSequences.findOne.mockResolvedValueOnce(sequence)

      const res = await service.dispatch({ type: 'stop_sequence', targetId: 'seq-1' }, principal)

      expect(outreachSequences.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'seq-1', status: 'cancelled' }))
      expect(outreachSequenceSteps.update).toHaveBeenCalledWith(
        { sequence_id: 'seq-1', status: 'pending' },
        { status: 'skipped' },
      )
      expect(res).toEqual({
        type: 'stop_sequence',
        status: 'done',
        externalRef: 'seq-1',
        reason: 'Séquence arrêtée — les étapes restantes sont annulées.',
      })
    })

    it('cancels a paused sequence too', async () => {
      const { service, outreachSequences } = build()
      outreachSequences.findOne.mockResolvedValueOnce({ id: 'seq-2', user_id: 'user-1', status: 'paused' })

      const res = await service.dispatch({ type: 'stop_sequence', targetId: 'seq-2' }, principal)

      expect(res.status).toBe('done')
    })

    it('skips when the sequence is not found (or not owned)', async () => {
      const { service, outreachSequences } = build()
      outreachSequences.findOne.mockResolvedValueOnce(null)

      const res = await service.dispatch({ type: 'stop_sequence', targetId: 'seq-x' }, principal)

      expect(res).toEqual({ type: 'stop_sequence', status: 'skipped', reason: 'Séquence introuvable.' })
    })

    it('skips a sequence already completed or cancelled — never re-fires', async () => {
      const { service, outreachSequences, outreachSequenceSteps } = build()
      outreachSequences.findOne.mockResolvedValueOnce({ id: 'seq-3', user_id: 'user-1', status: 'cancelled' })

      const res = await service.dispatch({ type: 'stop_sequence', targetId: 'seq-3' }, principal)

      expect(res).toEqual({ type: 'stop_sequence', status: 'skipped', reason: 'La séquence est déjà « cancelled ».' })
      expect(outreachSequenceSteps.update).not.toHaveBeenCalled()
    })
  })

  // #2277.35 / épopée #2771 — restaure `contact.user_status` au `previous_status`
  // tracé par `ContactsService.recordOutcomeAction`. Réutilise `updateStatus`.
  describe('restore_status (rollback #2771)', () => {
    it('calls ContactsService.updateStatus with the tracked previous_status', async () => {
      const { service, contacts, userActions } = build()
      const action = {
        id: 'ua-5',
        contact_id: 'c1',
        account_id: null,
        metadata: { previous_status: 'contacted' },
      } as unknown as UserActionEntity
      userActions.findOne.mockResolvedValueOnce(action)
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
      contacts.updateStatus.mockResolvedValueOnce(success({ ...contact, user_status: 'contacted' }))

      const res = await service.dispatch({ type: 'restore_status', targetId: 'ua-5' }, principal)

      expect(contacts.updateStatus).toHaveBeenCalledWith('c1', 'user-1', 'contacted')
      expect(userActions.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ua-5', metadata: expect.objectContaining({ restored_at: expect.any(String) }) }),
      )
      expect(res).toEqual({
        type: 'restore_status',
        status: 'done',
        externalRef: 'c1',
        reason: 'Statut restauré : « contacted ».',
      })
    })

    it('skips when the target action is not found', async () => {
      const { service, userActions } = build()
      userActions.findOne.mockResolvedValueOnce(null)

      const res = await service.dispatch({ type: 'restore_status', targetId: 'ua-x' }, principal)

      expect(res).toEqual({ type: 'restore_status', status: 'skipped', reason: 'Action introuvable.' })
    })

    it('refuses to invent a status when previous_status was never tracked', async () => {
      const { service, userActions, contacts } = build()
      userActions.findOne.mockResolvedValueOnce({
        id: 'ua-6',
        contact_id: 'c1',
        metadata: {},
      } as unknown as UserActionEntity)

      const res = await service.dispatch({ type: 'restore_status', targetId: 'ua-6' }, principal)

      expect(res).toEqual({
        type: 'restore_status',
        status: 'skipped',
        reason: 'Aucun statut antérieur connu pour cette action : rien à restaurer.',
      })
      expect(contacts.updateStatus).not.toHaveBeenCalled()
    })

    it('skips (no-op) when already restored', async () => {
      const { service, userActions, contacts } = build()
      userActions.findOne.mockResolvedValueOnce({
        id: 'ua-7',
        contact_id: 'c1',
        metadata: { previous_status: 'contacted', restored_at: '2026-09-01T00:00:00.000Z' },
      } as unknown as UserActionEntity)

      const res = await service.dispatch({ type: 'restore_status', targetId: 'ua-7' }, principal)

      expect(res).toEqual({ type: 'restore_status', status: 'skipped', reason: 'Ce statut a déjà été restauré.' })
      expect(contacts.updateStatus).not.toHaveBeenCalled()
    })

    it('skips an account-scoped declaration — not wired to this rollback', async () => {
      const { service, userActions, contacts } = build()
      userActions.findOne.mockResolvedValueOnce({
        id: 'ua-8',
        contact_id: null,
        account_id: 'acc1',
        metadata: { previous_status: 'opportunity' },
      } as unknown as UserActionEntity)

      const res = await service.dispatch({ type: 'restore_status', targetId: 'ua-8' }, principal)

      expect(res).toEqual({
        type: 'restore_status',
        status: 'skipped',
        reason: "La restauration d'un statut de compte n'est pas câblée sur ce rollback.",
      })
      expect(contacts.updateStatus).not.toHaveBeenCalled()
    })
  })

  // #2277.36 / épopée #2771 — retire une tâche CRM en versant une note
  // rectificative (HubSpot), jamais en supprimant quoi que ce soit côté CRM.
  describe('remove_crm_task (rollback #2771)', () => {
    function crmTaskAction(overrides: Record<string, unknown> = {}) {
      return {
        id: 'ua-10',
        contact_id: 'c1',
        metadata: {
          router_intent: 'create_crm_task',
          crm_provider: 'hubspot',
          external_ref: 'hs-42',
          ...overrides,
        },
      } as unknown as UserActionEntity
    }

    it('posts a rectifying note to HubSpot and marks the local row withdrawn', async () => {
      const { service, userActions, crm } = build()
      userActions.findOne.mockResolvedValueOnce(crmTaskAction())

      const res = await service.dispatch({ type: 'remove_crm_task', targetId: 'ua-10' }, principal)

      expect(crm.logActivity).toHaveBeenCalledWith(
        'user-1',
        'hs-42',
        expect.stringContaining('Tâche annulée'),
        expect.objectContaining({ origin: 'user' }),
      )
      expect(userActions.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ua-10',
          metadata: expect.objectContaining({ withdrawn_at: expect.any(String), status: 'Retirée' }),
        }),
      )
      expect(res).toEqual({
        type: 'remove_crm_task',
        status: 'done',
        externalRef: 'ua-10',
        reason: 'Une note rectificative a été versée au CRM.',
      })
    })

    it('skips when the target action is not found', async () => {
      const { service, userActions } = build()
      userActions.findOne.mockResolvedValueOnce(null)

      const res = await service.dispatch({ type: 'remove_crm_task', targetId: 'ua-x' }, principal)

      expect(res).toEqual({ type: 'remove_crm_task', status: 'skipped', reason: 'Tâche CRM introuvable.' })
    })

    it('skips (no-op) when already withdrawn', async () => {
      const { service, userActions, crm } = build()
      userActions.findOne.mockResolvedValueOnce(crmTaskAction({ withdrawn_at: '2026-09-01T00:00:00.000Z' }))

      const res = await service.dispatch({ type: 'remove_crm_task', targetId: 'ua-10' }, principal)

      expect(res).toEqual({ type: 'remove_crm_task', status: 'skipped', reason: 'Cette tâche a déjà été retirée.' })
      expect(crm.logActivity).not.toHaveBeenCalled()
    })

    it('marks the row withdrawn locally, honestly, when no CRM compensation is wired (salesforce)', async () => {
      const { service, userActions, crm } = build()
      userActions.findOne.mockResolvedValueOnce(crmTaskAction({ crm_provider: 'salesforce', external_ref: 'sf-1' }))

      const res = await service.dispatch({ type: 'remove_crm_task', targetId: 'ua-10' }, principal)

      expect(crm.logActivity).not.toHaveBeenCalled()
      expect(res).toEqual({
        type: 'remove_crm_task',
        status: 'done',
        externalRef: 'ua-10',
        reason: "Tâche retirée localement — aucune compensation n'est branchée pour ce fournisseur.",
      })
    })

    it('refuses to write to an external CRM from a demo workspace', async () => {
      const { service, userActions, crm } = build({ demo: true })
      userActions.findOne.mockResolvedValueOnce(crmTaskAction())

      const res = await service.dispatch({ type: 'remove_crm_task', targetId: 'ua-10' }, principal)

      expect(crm.logActivity).not.toHaveBeenCalled()
      expect(res.status).toBe('skipped')
    })
  })

  // #2319.114 (épopée #2985) — CLÔTURE réellement la tâche chez HubSpot,
  // distinct de `remove_crm_task` ci-dessus qui la RETIRE par compensation.
  describe('close_crm_task (#2319.114)', () => {
    function crmTaskAction(overrides: Record<string, unknown> = {}) {
      return {
        id: 'ua-10',
        contact_id: 'c1',
        metadata: {
          router_intent: 'create_crm_task',
          crm_provider: 'hubspot',
          external_ref: 'hs-42',
          ...overrides,
        },
      } as unknown as UserActionEntity
    }

    it('closes the HubSpot task and marks the local row closed', async () => {
      const { service, userActions, crm } = build()
      userActions.findOne.mockResolvedValueOnce(crmTaskAction())

      const res = await service.dispatch({ type: 'close_crm_task', targetId: 'ua-10' }, principal)

      expect(crm.closeTask).toHaveBeenCalledWith(
        'user-1',
        { taskId: 'hs-42' },
        expect.objectContaining({ origin: 'user' }),
      )
      expect(userActions.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ua-10',
          metadata: expect.objectContaining({ closed_at: expect.any(String), status: 'Terminée' }),
        }),
      )
      expect(res).toEqual({ type: 'close_crm_task', status: 'done', externalRef: 'ua-10' })
    })

    it('skips when the target action is not found', async () => {
      const { service, userActions } = build()
      userActions.findOne.mockResolvedValueOnce(null)

      const res = await service.dispatch({ type: 'close_crm_task', targetId: 'ua-x' }, principal)

      expect(res).toEqual({ type: 'close_crm_task', status: 'skipped', reason: 'Tâche CRM introuvable.' })
    })

    it('skips (no-op) when already closed', async () => {
      const { service, userActions, crm } = build()
      userActions.findOne.mockResolvedValueOnce(crmTaskAction({ closed_at: '2026-09-27T00:00:00.000Z' }))

      const res = await service.dispatch({ type: 'close_crm_task', targetId: 'ua-10' }, principal)

      expect(res).toEqual({ type: 'close_crm_task', status: 'skipped', reason: 'Cette tâche a déjà été clôturée.' })
      expect(crm.closeTask).not.toHaveBeenCalled()
    })

    it('skips (no-op) when already withdrawn — closing and removing are mutually exclusive', async () => {
      const { service, userActions, crm } = build()
      userActions.findOne.mockResolvedValueOnce(crmTaskAction({ withdrawn_at: '2026-09-01T00:00:00.000Z' }))

      const res = await service.dispatch({ type: 'close_crm_task', targetId: 'ua-10' }, principal)

      expect(res).toEqual({ type: 'close_crm_task', status: 'skipped', reason: 'Cette tâche a déjà été retirée.' })
      expect(crm.closeTask).not.toHaveBeenCalled()
    })

    it('never guesses a close call for a provider that cannot close a task from this repo', async () => {
      const { service, userActions, crm } = build()
      userActions.findOne.mockResolvedValueOnce(crmTaskAction({ crm_provider: 'salesforce', external_ref: 'sf-1' }))

      const res = await service.dispatch({ type: 'close_crm_task', targetId: 'ua-10' }, principal)

      expect(crm.closeTask).not.toHaveBeenCalled()
      expect(res).toEqual({
        type: 'close_crm_task',
        status: 'skipped',
        reason: "Aucune clôture n'est branchée pour ce fournisseur : rien n'a été écrit.",
      })
    })

    it('refuses to write to an external CRM from a demo workspace', async () => {
      const { service, userActions, crm } = build({ demo: true })
      userActions.findOne.mockResolvedValueOnce(crmTaskAction())

      const res = await service.dispatch({ type: 'close_crm_task', targetId: 'ua-10' }, principal)

      expect(crm.closeTask).not.toHaveBeenCalled()
      expect(res.status).toBe('skipped')
    })
  })
})

describe('ActionRouterService.dispatchBulk', () => {
  it('runs every intent best-effort and aggregates a per-status summary', async () => {
    const { service, contacts, crm } = build()
    // 1) send_email → done
    contacts.sendEmail.mockResolvedValueOnce(
      success({ contact_id: 'c1', sent_to: 'jean@corp.fr', email_sent_at: '2026-07-16T00:00:00.000Z' }),
    )
    // 2) create_crm_task → skipped (not connected)
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    crm.getStatus.mockResolvedValueOnce({ configured: true, connected: false })
    // 3) enrich_contact → owned but out of credit → skipped
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    contacts.enrichContact.mockResolvedValueOnce(failure({ code: 'insufficient_credits', message: 'épuisés' }))

    const res = await service.dispatchBulk(
      [
        { type: 'send_email', contactId: 'c1' },
        { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' },
        { type: 'enrich_contact', contactId: 'c1' },
      ],
      principal,
    )

    expect(res.results).toHaveLength(3)
    expect(res.results.map(r => r.status)).toEqual(['done', 'skipped', 'skipped'])
    expect(res.summary).toEqual({ total: 3, done: 1, queued: 0, skipped: 2, failed: 0 })
    // Workspace resolved once for the whole batch.
  })
})

/**
 * Le rappel posé sur le VRAI agenda (addendum final §14).
 *
 * Le routeur dégradait systématiquement vers le journal interne en annonçant
 * « calendrier non connecté », y compris à un utilisateur dont l'agenda était
 * branché : la capacité existait dans un module autonome, personne ne l'appelait.
 * Un rappel qui ne sonne que dans Bellum n'est pas un rappel.
 */
describe('ActionRouterService — agenda réel', () => {
  it('pose le rappel sur l’agenda quand il est connecté', async () => {
    const { service, calendar, userActions, accounts } = build({ calendarConnected: true })
    accounts.findOne.mockResolvedValueOnce({ id: 'acc1', company_name: 'ACME', status: 'completed' })
    const result = await service.dispatch(
      { type: 'schedule_reminder', accountId: 'acc1', at: '2026-09-01T09:00:00.000Z', note: 'Relancer la DSI' },
      principal,
    )
    expect(calendar.createEvent).toHaveBeenCalledTimes(1)
    expect(calendar.createEvent.mock.calls[0][1]).toMatchObject({
      title: 'Relancer la DSI',
      startsAt: '2026-09-01T09:00:00.000Z',
      link: '/accounts/acc1',
    })
    expect(result).toMatchObject({ status: 'done', externalRef: 'evt-1' })
    expect(result.reason).toContain('agenda')
    // Le journal est écrit DANS LES DEUX CAS : c'est lui qui porte la traçabilité.
    expect(userActions.save).toHaveBeenCalled()
  })

  it('retombe sur le journal interne — et le dit — quand l’agenda casse', async () => {
    // Un jeton expiré ne doit pas faire perdre le rappel : on le pose en interne
    // plutôt que d'échouer.
    const { service, calendar, accounts } = build({ calendarConnected: true })
    accounts.findOne.mockResolvedValueOnce({ id: 'acc1', company_name: 'ACME', status: 'completed' })
    calendar.createEvent.mockRejectedValueOnce(new Error('token expired'))
    const result = await service.dispatch(
      { type: 'schedule_reminder', accountId: 'acc1', at: '2026-09-01T09:00:00.000Z' },
      principal,
    )
    expect(result.status).toBe('done')
    expect(result.reason).toContain('aucun agenda connecté')
  })

  it('refuse de créer un événement sans agenda — jamais une fausse réunion', async () => {
    // Une ligne de journal déguisée en réunion laisserait croire que des
    // invitations sont parties.
    const { service, userActions } = build({ calendarConnected: false })
    const result = await service.dispatch(
      {
        type: 'create_calendar_event',
        accountId: 'acc1',
        title: 'Point DSI',
        startsAt: '2026-09-02T10:00:00.000Z',
        durationMinutes: 45,
        attendees: ['dsi@acme.example'],
      },
      principal,
    )
    expect(result).toMatchObject({ status: 'skipped' })
    expect(result.reason).toContain('Aucun agenda connecté')
    expect(userActions.save).not.toHaveBeenCalled()
  })

  /**
   * #1943.3 — « SCOPE INDISPONIBLE » ne se devine pas, il se NOMME.
   *
   * Avant ce test, `tryCalendar` avalait TOUTE exception (`catch { log; continue }`)
   * et, aucun agenda n'ayant abouti, retombait sur « Aucun agenda connecté » —
   * un mensonge exact sur un agenda qui EST connecté, mais dont la portée
   * d'écriture manque. Même défaut que le PDF 7 décrit pour `not_connected` vs
   * `scope_missing` (`connector-error.ts`).
   */
  it('un agenda CONNECTÉ mais dont l’écriture est refusée (portée manquante) le NOMME — jamais « aucun agenda connecté »', async () => {
    const { service, calendar, userActions } = build({ calendarConnected: true })
    calendar.createEvent.mockRejectedValueOnce(
      scopeMissing({
        provider: 'google',
        capability: 'calendar',
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
        message: connectorMessage('scope_missing', 'ton agenda'),
      }),
    )
    const result = await service.dispatch(
      {
        type: 'create_calendar_event',
        accountId: 'acc1',
        title: 'Point DSI',
        startsAt: '2026-09-02T10:00:00.000Z',
        durationMinutes: 45,
        attendees: ['dsi@acme.example'],
      },
      principal,
    )
    expect(result).toMatchObject({ status: 'skipped' })
    expect(result.reason).not.toContain('Aucun agenda connecté')
    expect(result.reason).toContain("Je n'ai pas le droit de regarder ton agenda")
    expect(result.reason).toContain('Reconnecte')
    expect(userActions.save).not.toHaveBeenCalled()
  })

  it('crée l’événement avec sa durée et ses invités quand l’agenda répond', async () => {
    const { service, calendar } = build({ calendarConnected: true })
    const result = await service.dispatch(
      {
        type: 'create_calendar_event',
        accountId: 'acc1',
        title: 'Point DSI',
        startsAt: '2026-09-02T10:00:00.000Z',
        durationMinutes: 45,
        attendees: ['dsi@acme.example'],
      },
      principal,
    )
    expect(result).toMatchObject({ status: 'done', externalRef: 'evt-1' })
    expect(calendar.createEvent.mock.calls[0][1]).toMatchObject({
      endsAt: '2026-09-02T10:45:00.000Z',
      attendees: ['dsi@acme.example'],
    })
  })
})

/**
 * La note CRM n'upserte JAMAIS. `create_crm_task` remonte la fiche entière (et
 * peut donc la créer) ; écrire une note ne doit pas en faire autant, sans quoi
 * chaque compte rendu d'appel fabrique un doublon (p28).
 */
describe('ActionRouterService — note CRM sans upsert', () => {
  it('écrit la note sur la fiche fournie par un pas précédent', async () => {
    const { service, contacts, crm } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    const result = await service.dispatch(
      { type: 'create_crm_note', contactId: 'c1', note: 'Appel du 2 septembre', crmRecordId: 'hs-77' },
      principal,
    )
    expect(crm.logActivity).toHaveBeenCalledWith(principal.userId, 'hs-77', 'Appel du 2 septembre', {
      origin: 'user',
      source: null,
    })
    expect(crm.exportContact).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'done', externalRef: 'hs-77' })
  })

  it('saute plutôt que de créer la fiche quand elle est introuvable', async () => {
    const { service, contacts, crm } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    crm.findPresence.mockResolvedValueOnce({ provider: 'hubspot', matched: false, contacts: [], openDeals: [] })
    const result = await service.dispatch({ type: 'create_crm_note', contactId: 'c1', note: 'Appel' }, principal)
    expect(result).toMatchObject({ status: 'skipped' })
    expect(crm.exportContact).not.toHaveBeenCalled()
    expect(crm.logActivity).not.toHaveBeenCalled()
  })
})

describe('ActionRouterService — notification in-app', () => {
  it('rend compte au propriétaire du run', async () => {
    const { service, notifier } = build()
    const result = await service.dispatch(
      { type: 'notify_user', title: '3 nouveaux signaux', body: 'sur SNCF', link: '/accounts/x' },
      principal,
    )
    expect(notifier.notify).toHaveBeenCalledWith(principal.userId, {
      title: '3 nouveaux signaux',
      body: 'sur SNCF',
      link: '/accounts/x',
    })
    expect(result).toMatchObject({ status: 'done', externalRef: 'notif-1' })
  })
})

/**
 * DEUX CLICS, UN SEUL EFFET (D520) — le routeur lui-même déduplique, en amont
 * de tout verrou propre à la capacité sous-jacente.
 *
 * ⚠️ Ces tests tournent contre un dépôt en mémoire qui rejoue la contrainte
 * d'unicité `action_dispatch_attempts_dedupe_idx (workspace_id,
 * idempotency_key)` posée par la migration — un `jest.fn()` qui rendrait
 * `{ affected: 1 }` sans jamais refuser un doublon ne prouverait rien (même
 * principe que `credit-reservation.service.spec.ts`).
 */
describe('ActionRouterService — idempotence du dispatch', () => {
  /** L'erreur que Postgres lève sur l'index unique. */
  class UniqueViolation extends Error {
    readonly code = '23505'
    constructor() {
      super('duplicate key value violates unique constraint "action_dispatch_attempts_dedupe_idx"')
    }
  }

  type AttemptRow = {
    workspace_id: string
    idempotency_key: string
    intent_type: string
    // #1959 — l'auteur de la tentative ; `null` = système, jamais un trou.
    user_id: string | null
    status: string | null
    reason: string | null
    external_ref: string | null
    /** #1959.10 — l'heure RÉELLE d'exécution ; `null` = encore en vol. */
    completed_at: Date | null
  }

  /**
   * #1959.9 — la table des profils que le LEFT JOIN de `readClaimedAttempt`
   * interroge. Un identifiant sans profil (compte supprimé) doit rendre un
   * `actor: null`, pas un nom inventé : c'est ce que ce dictionnaire permet de
   * prouver en laissant une clé absente.
   */
  const PROFILES: Record<string, { first_name: string | null; last_name: string | null; email: string | null }> = {
    'user-1': { first_name: 'Léa', last_name: 'Martin', email: 'rep@esn.fr' },
    'user-9': { first_name: 'Marc', last_name: 'Dubois', email: 'marc@esn.fr' },
  }

  /** Se comporte comme la table : refuse une seconde ligne pour la même
   *  (workspace, clé), et sert les mêmes SELECT/UPDATE que le service émet. */
  function inMemoryAttempts(seed: AttemptRow[] = []) {
    const rows: AttemptRow[] = [...seed]
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO action_dispatch_attempts')) {
        const [workspaceId, idempotencyKey, intentType, userId] = params as (string | null)[]
        if (rows.some(r => r.workspace_id === workspaceId && r.idempotency_key === idempotencyKey)) {
          throw new UniqueViolation()
        }
        rows.push({
          workspace_id: workspaceId as string,
          idempotency_key: idempotencyKey as string,
          intent_type: intentType as string,
          user_id: userId ?? null,
          status: null,
          reason: null,
          external_ref: null,
          completed_at: null,
        })
        return []
      }
      if (sql.includes('UPDATE action_dispatch_attempts')) {
        const [workspaceId, idempotencyKey, status, reason, externalRef] = params as (string | null)[]
        const row = rows.find(r => r.workspace_id === workspaceId && r.idempotency_key === idempotencyKey)
        if (row) {
          row.status = status
          row.reason = reason
          row.external_ref = externalRef
          // La table pose `completed_at = now()` dans le même UPDATE.
          row.completed_at = new Date('2026-09-15T12:32:00.000Z')
        }
        return []
      }
      if (sql.includes('SELECT') && sql.includes('action_dispatch_attempts')) {
        const [workspaceId, idempotencyKey] = params as string[]
        const row = rows.find(r => r.workspace_id === workspaceId && r.idempotency_key === idempotencyKey)
        if (!row) return []
        // #1959.9 — le LEFT JOIN sur `profiles` : un auteur sans profil reste
        // `null` de part en part, jamais un nom deviné.
        const profile = row.user_id ? PROFILES[row.user_id] : undefined
        return [
          {
            status: row.status,
            reason: row.reason,
            external_ref: row.external_ref,
            user_id: row.user_id,
            completed_at: row.completed_at,
            first_name: profile?.first_name ?? null,
            last_name: profile?.last_name ?? null,
            email: profile?.email ?? null,
          },
        ]
      }
      return []
    })
    return { query, rows }
  }

  it('deux dispatchs avec la MÊME clé ⇒ un seul effet, et le second rend le résultat du premier', async () => {
    const { service, notifier, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)

    const first = await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)
    const second = await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)

    expect(notifier.notify).toHaveBeenCalledTimes(1)
    expect(first).toEqual({ type: 'notify_user', status: 'done', externalRef: 'notif-1' })
    // #1959.9/.10 — le second rend le MÊME effet, et EN PLUS d'où il vient :
    // le rejeu porte `claim`, le premier envoi n'a rien à réclamer.
    expect(second).toMatchObject({ type: 'notify_user', status: 'done', externalRef: 'notif-1' })
    expect(first.claim).toBeUndefined()
    expect(second.claim?.self).toBe(true)
    expect(attempts.rows).toHaveLength(1)
  })

  /**
   * #1952.38 — L'INTENT QUE LES APPELANTS WEB ENVOIENT VRAIMENT.
   *
   * Les trois fenêtres qui dispatchent depuis le navigateur (la carte de Laura,
   * « Créer un rappel » sur un besoin, « Exécuter » sur une sélection) ne
   * fournissaient AUCUNE clé : `dispatchIdempotent` rendait la main à
   * `dispatchOne`, donc un double clic écrivait deux rappels. Les tests
   * ci-dessus prouvaient le mécanisme sur `notify_user` ; celui-ci le prouve
   * sur l'intent qui sort réellement de ces trois écrans — et il compte les
   * ÉCRITURES, pas les appels : c'est la ligne de journal en double que
   * l'utilisateur voyait.
   */
  it('#1952.38 — un `schedule_reminder` rejoué avec la MÊME clé n’écrit qu’une ligne de journal', async () => {
    const { service, contacts, userActions, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)
    contacts.findOwnedForAction.mockResolvedValue(success(contact))

    const intent = {
      type: 'schedule_reminder',
      contactId: 'c1',
      at: '2026-09-01T07:00:00.000Z',
      note: 'Relancer après le POC',
      idempotencyKey: 'chat-card.schedule_reminder:a3f0c1d2-0000-4000-8000-000000000001',
    } as const

    const first = await service.dispatch(intent, principal)
    const second = await service.dispatch(intent, principal)

    expect(userActions.create).toHaveBeenCalledTimes(1)
    expect(first.status).toBe('done')
    // Le rejeu rend le même résultat, augmenté de sa provenance (#1959.9/.10).
    expect(second).toMatchObject({ type: first.type, status: first.status, externalRef: first.externalRef })
    expect(second.claim?.self).toBe(true)
    expect(attempts.rows).toHaveLength(1)
  })

  it('#1959 — la tentative réclamée porte l’auteur du dispatch, pas seulement le workspace', async () => {
    // QUI a déclenché la tentative : un séquenceur (`outreach.service.ts`) ou un
    // run Action OS dispatchent au même titre qu'un clic dans le chat, et
    // aucune des neuf colonnes d'avant ne le disait.
    const { service, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)

    await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)

    expect(attempts.rows).toHaveLength(1)
    expect(attempts.rows[0]?.user_id).toBe(principal.userId)
  })

  it('deux dispatchs SANS clé ⇒ comportement inchangé (pas de régression, aucune ligne écrite)', async () => {
    const { service, notifier, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)

    const first = await service.dispatch({ type: 'notify_user', title: 'Signal' }, principal)
    const second = await service.dispatch({ type: 'notify_user', title: 'Signal' }, principal)

    expect(notifier.notify).toHaveBeenCalledTimes(2)
    expect(first).toMatchObject({ status: 'done' })
    expect(second).toMatchObject({ status: 'done' })
    // Aucune écriture de déduplication n'a eu lieu — le chemin est byte-identique.
    expect(attempts.rows).toHaveLength(0)
  })

  it('deux GESTES LÉGITIMES espacés dans le temps (clés différentes) ⇒ deux effets', async () => {
    // Le piège que la clé doit éviter : dériver du contenu (même contact, même
    // type d'intent) confondrait une VRAIE seconde relance avec un rejeu.
    const { service, notifier, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)

    const first = await service.dispatch(
      { type: 'notify_user', title: 'Relance semaine 1', idempotencyKey: 'clic-1' },
      principal,
    )
    const second = await service.dispatch(
      { type: 'notify_user', title: 'Relance semaine 4', idempotencyKey: 'clic-2' },
      principal,
    )

    expect(notifier.notify).toHaveBeenCalledTimes(2)
    expect(first.status).toBe('done')
    expect(second.status).toBe('done')
    expect(attempts.rows).toHaveLength(2)
  })

  it('une violation d’unicité CONCURRENTE (tentative encore en vol) se lit « déjà fait », jamais une erreur', async () => {
    // Simule la course : une autre tentative a déjà réclamé la clé, et n'a pas
    // fini (status encore NULL) — le cas qu'un simple SELECT-avant-write rate.
    const { service, notifier, accounts } = build()
    const attempts = inMemoryAttempts([
      {
        workspace_id: 'ws-1',
        idempotency_key: 'clic-1',
        intent_type: 'notify_user',
        user_id: 'user-1',
        status: null,
        reason: null,
        external_ref: null,
        completed_at: null,
      },
    ])
    accounts.query.mockImplementation(attempts.query)

    const result = await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)

    // Jamais une seconde exécution, jamais une exception propagée.
    expect(notifier.notify).not.toHaveBeenCalled()
    expect(result.status).toBe('skipped')
    expect(result.reason).toContain('en cours')
  })

  /**
   * #1959.9 / #1959.10 — « DÉJÀ LANCÉ » NOMME QUELQU'UN ET UNE HEURE.
   *
   * Le message rendu jusqu'ici — « Une action identique (même clé) est déjà en
   * cours de traitement » — ne disait ni QUI ni QUAND : devant lui, personne ne
   * sait à qui parler, ni si l'effet a eu lieu. Les deux colonnes existaient
   * (`user_id` depuis la migration `ActionDispatchAttemptAuthor`,
   * `completed_at` depuis l'origine) ; elles ne sortaient pas du service.
   */
  it('#1959.9/.10 — une clé déjà réclamée par QUELQU’UN D’AUTRE nomme cette personne et l’heure réelle', async () => {
    const { service, notifier, accounts } = build()
    const attempts = inMemoryAttempts([
      {
        workspace_id: 'ws-1',
        idempotency_key: 'clic-1',
        intent_type: 'notify_user',
        user_id: 'user-9',
        status: 'done',
        reason: 'Rappel programmé.',
        external_ref: 'notif-7',
        completed_at: new Date('2026-09-15T12:32:00.000Z'),
      },
    ])
    accounts.query.mockImplementation(attempts.query)

    const result = await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)

    expect(notifier.notify).not.toHaveBeenCalled()
    // #1959.12 — le second voit le RÉSULTAT RÉEL, pas une erreur.
    expect(result.status).toBe('done')
    expect(result.externalRef).toBe('notif-7')
    expect(result.claim).toEqual({
      actor: 'Marc Dubois',
      completedAt: '2026-09-15T12:32:00.000Z',
      self: false,
    })
  })

  it('#1959.9 — l’auteur d’origine qui rejoue son propre geste est reconnu (`self`)', async () => {
    const { service, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)

    await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)
    const second = await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)

    expect(second.claim?.self).toBe(true)
    expect(second.claim?.actor).toBe('Léa Martin')
  })

  it('#1959.10 — un effet ENCORE EN VOL n’invente aucune heure d’exécution', async () => {
    // « Non mesuré n'est jamais 0 », appliqué au temps : tant que `completed_at`
    // est NULL, rendre l'heure de la réclamation afficherait une exécution
    // terminée qui ne l'est pas.
    const { service, accounts } = build()
    const attempts = inMemoryAttempts([
      {
        workspace_id: 'ws-1',
        idempotency_key: 'clic-1',
        intent_type: 'notify_user',
        user_id: 'user-9',
        status: null,
        reason: null,
        external_ref: null,
        completed_at: null,
      },
    ])
    accounts.query.mockImplementation(attempts.query)

    const result = await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)

    expect(result.status).toBe('skipped')
    expect(result.claim).toEqual({ actor: 'Marc Dubois', completedAt: null, self: false })
  })

  it('#1959.9 — un dispatch SYSTÈME (aucun auteur) rend `actor: null`, jamais un nom deviné', async () => {
    const { service, accounts } = build()
    const attempts = inMemoryAttempts([
      {
        workspace_id: 'ws-1',
        idempotency_key: 'clic-1',
        intent_type: 'notify_user',
        user_id: null,
        status: 'done',
        reason: 'Fait.',
        external_ref: null,
        completed_at: new Date('2026-09-15T12:32:00.000Z'),
      },
    ])
    accounts.query.mockImplementation(attempts.query)

    const result = await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)

    expect(result.claim).toEqual({ actor: null, completedAt: '2026-09-15T12:32:00.000Z', self: false })
  })

  it('#1959.9 — un dispatch SANS rejeu ne porte aucun `claim` (rien n’a été « déjà lancé »)', async () => {
    // Le témoin du cas légitime voisin : la garde ne doit pas coller un
    // « déjà lancé » sur un geste qui part pour la première fois.
    const { service, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)

    const first = await service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal)

    expect(first.claim).toBeUndefined()
  })

  it('COURSE réelle (Promise.all, même clé) : un seul effet, aucune exception des deux côtés', async () => {
    const { service, notifier, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)

    const [first, second] = await Promise.all([
      service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal),
      service.dispatch({ type: 'notify_user', title: 'Signal', idempotencyKey: 'clic-1' }, principal),
    ])

    expect(notifier.notify).toHaveBeenCalledTimes(1)
    // Le gagnant exécute vraiment ; le perdant ne réexécute jamais et ne lève pas.
    expect([first.status, second.status].sort()).toEqual(['done', 'skipped'])
  })

  it('un `unknown` (timeout) rejoué avec la MÊME clé reste `unknown` — jamais retenté tout seul', async () => {
    // Doctrine : un timeout n'est pas un échec ; `unknown` ARRÊTE la reprise.
    // La clé doit faire tenir ce refus sur un second appel, pas le rejouer.
    const { service, crm, contacts, accounts } = build()
    const attempts = inMemoryAttempts()
    accounts.query.mockImplementation(attempts.query)
    contacts.findOwnedForAction.mockResolvedValue(success(contact))
    // Une requête PARTIE sans réponse — le marqueur « in-flight » de dispatchFailureOutcome.
    crm.exportContact.mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))

    const first = await service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot', idempotencyKey: 'clic-1' },
      principal,
    )
    expect(first.status).toBe('unknown')

    const second = await service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot', idempotencyKey: 'clic-1' },
      principal,
    )

    // Jamais un second appel réseau — le résultat `unknown` est simplement relu.
    expect(crm.exportContact).toHaveBeenCalledTimes(1)
    expect(second.status).toBe('unknown')
  })
})

/**
 * PIÈGE L1 (#1931) — `crmTaskProviderSchema` accepte quatre fournisseurs depuis
 * L1, et `dispatchCrmTask` branchait `hubspot ? … : salesforce` : une tâche
 * Pipedrive ou Attio partait dans le Salesforce du client.
 */
describe('ActionRouterService — routage CRM EXPLICITE par fournisseur (piège L1)', () => {
  function door(id: string) {
    return {
      getStatus: jest.fn().mockResolvedValue({ connected: true }),
      exportContact: jest.fn().mockResolvedValue({ id }),
    }
  }

  it('une tâche Pipedrive part vers la porte Pipedrive — jamais vers Salesforce ni HubSpot', async () => {
    const pipedrive = door('pd-7')
    const { service, contacts, salesforce, crm } = build({ crm: { doors: { pipedrive } } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'pipedrive' },
      principal,
    )

    expect(pipedrive.exportContact).toHaveBeenCalledWith('user-1', expect.objectContaining({ email: 'jean@corp.fr' }))
    expect(salesforce.getStatus).not.toHaveBeenCalled()
    expect(salesforce.exportContact).not.toHaveBeenCalled()
    expect(crm.exportContact).not.toHaveBeenCalled()
    expect(res).toEqual({ type: 'create_crm_task', status: 'done', externalRef: 'pd-7' })
  })

  it('sait dire NON — un fournisseur SANS porte n’écrit nulle part, et le dit', async () => {
    const { service, contacts, salesforce, crm } = build({ ports: {} })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'attio' }, principal)

    expect(res.status).toBe('skipped')
    expect(res.reason).toContain('Aucune porte')
    expect(salesforce.exportContact).not.toHaveBeenCalled()
    expect(crm.exportContact).not.toHaveBeenCalled()
  })

  it.each(crmTaskProviderSchema.options)('%s atteint SA porte, et une seule', async provider => {
    const pipedrive = door('pd-1')
    const attio = door('at-1')
    // #4187 — Zoho est une porte du registre comme les autres : aucune branche de routage ajoutée.
    const zoho = door('zo-1')
    const { service, contacts, salesforce, crm } = build({ crm: { doors: { pipedrive, attio, zoho } } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: provider }, principal)

    const calls = {
      hubspot: crm.exportContact.mock.calls.length,
      salesforce: salesforce.exportContact.mock.calls.length,
      pipedrive: pipedrive.exportContact.mock.calls.length,
      attio: attio.exportContact.mock.calls.length,
      zoho: zoho.exportContact.mock.calls.length,
    }
    expect(calls).toEqual({ hubspot: 0, salesforce: 0, pipedrive: 0, attio: 0, zoho: 0, [provider]: 1 })
  })
})

/**
 * D9 (#1931) — seule la porte HubSpot recevait l'origine d'écriture ; Salesforce,
 * Pipedrive et Attio écrivaient en direct, sans porte. Et le routeur ne la passait
 * à personne : une écriture de routine était auto-approuvée comme un clic.
 */
describe('ActionRouterService — D9 : l’origine d’écriture atteint TOUTES les portes CRM', () => {
  const system: ActionPrincipal = { ...principal, origin: 'system' }

  it('HubSpot — une écriture SYSTÈME est passée comme telle ; retenue, elle est « en attente », pas un échec', async () => {
    const { service, contacts, crm } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    crm.exportContact.mockResolvedValueOnce(null)

    const res = await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' }, system)

    expect(crm.exportContact).toHaveBeenCalledWith('user-1', expect.anything(), { origin: 'system', source: null })
    expect(res.status).toBe('awaiting_approval')
  })

  it('Salesforce — passe par la MÊME porte : une écriture système est retenue, rien n’est exporté', async () => {
    const crmWriteGate = { request: jest.fn().mockResolvedValue({ decision: 'pending', requestId: 'owr-1' }) }
    const { service, contacts, salesforce } = build({ crm: { gate: crmWriteGate } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'salesforce' }, system)

    expect(crmWriteGate.request).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'salesforce',
        origin: 'system',
        kind: 'export_contact',
        workspaceId: 'ws-1',
      }),
    )
    expect(salesforce.exportContact).not.toHaveBeenCalled()
    expect(res).toMatchObject({ status: 'awaiting_approval', externalRef: 'owr-1' })
  })

  it('Pipedrive — un CLIC passe la porte en `user` et écrit', async () => {
    const crmWriteGate = { request: jest.fn().mockResolvedValue({ decision: 'write_now', requestId: 'owr-2' }) }
    const pipedrive = {
      getStatus: jest.fn().mockResolvedValue({ connected: true }),
      exportContact: jest.fn().mockResolvedValue({ id: 'pd-9' }),
    }
    const { service, contacts } = build({ crm: { gate: crmWriteGate, doors: { pipedrive } } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'pipedrive' },
      principal,
    )

    expect(crmWriteGate.request).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'pipedrive', origin: 'user' }),
    )
    expect(pipedrive.exportContact).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ status: 'done', externalRef: 'pd-9' })
  })

  it('sans porte de validation branchée, une écriture SYSTÈME vers un CRM non gardé est refusée — jamais écrite en direct', async () => {
    // #4186 — « sans porte » = aucun `crmWrites` branché : rien ne part, ni là ni ailleurs.
    const { service, contacts, salesforce } = build({ ports: {} })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'salesforce' }, system)

    expect(res.status).toBe('skipped')
    expect(salesforce.exportContact).not.toHaveBeenCalled()
  })

  it('note CRM — l’origine système atteint la porte ; retenue, elle attend', async () => {
    const { service, contacts, crm } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    crm.logActivity.mockResolvedValueOnce(null)

    const res = await service.dispatch(
      { type: 'create_crm_note', contactId: 'c1', note: 'Compte rendu', crmRecordId: 'hs-77' },
      system,
    )

    expect(crm.logActivity).toHaveBeenCalledWith('user-1', 'hs-77', 'Compte rendu', { origin: 'system', source: null })
    expect(res.status).toBe('awaiting_approval')
  })
})

describe('ActionRouterService — I6 : la salle de démonstration n’écrit dans aucun outil', () => {
  it('export CRM : sauté, rien exporté', async () => {
    const { service, contacts, crm } = build({ demo: true })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    const res = await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' }, principal)
    expect(res.status).toBe('skipped')
    expect(crm.exportContact).not.toHaveBeenCalled()
  })

  it('événement d’agenda : sauté, aucun événement', async () => {
    const { service, calendar } = build({ demo: true, calendarConnected: true })
    const res = await service.dispatch(
      {
        type: 'create_calendar_event',
        title: 'Point DSI',
        startsAt: '2026-09-02T10:00:00.000Z',
        durationMinutes: 30,
        attendees: [],
      },
      principal,
    )
    expect(res.status).toBe('skipped')
    expect(calendar.createEvent).not.toHaveBeenCalled()
  })

  it('rappel : reste interne — l’agenda n’est même pas interrogé', async () => {
    const { service, contacts, calendar, userActions } = build({ demo: true, calendarConnected: true })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    const res = await service.dispatch(
      { type: 'schedule_reminder', contactId: 'c1', at: '2026-08-01T09:00:00.000Z' },
      principal,
    )
    expect(calendar.isConnected).not.toHaveBeenCalled()
    expect(res.status).toBe('done')
    expect(userActions.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ source: 'internal_reminder' }) }),
    )
  })
})

describe('ActionRouterService — I4 / D3 : l’enrichissement rapporte le débit OBSERVÉ', () => {
  it('rien trouvé : `creditsDebited: 0` — jamais l’estimation', async () => {
    const { service, contacts } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    contacts.enrichContact.mockResolvedValueOnce(success({ ...contact, credits_remaining: 0, credits_debited: 0 }))
    const res = await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal)
    expect(res).toMatchObject({ status: 'done', creditsDebited: 0 })
  })

  // #1943.10 — un enrichissement « fait » à 0 crédit débité est un résultat
  // VIDE, pas un succès générique : sans cette raison, `cardResultOf`
  // (apps/api/src/modules/action-os/copilot-card.service.ts) retombe sur
  // « Action exécutée. », qui se lit exactement comme une fiche complétée.
  // Ce que `PendingActions.tsx` dit déjà côté carte locale (`enrichNotFound`)
  // manquait côté carte Action OS.
  it('rien trouvé : la raison le dit — sans elle, une carte Action OS affiche « Action exécutée » sur un résultat vide', async () => {
    const { service, contacts } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    contacts.enrichContact.mockResolvedValueOnce(success({ ...contact, credits_remaining: 0, credits_debited: 0 }))
    const res = await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal)
    expect(res.reason).toBe('Aucune coordonnée trouvée — rien n’a été consommé.')
  })

  it('trouvé : le débit rapporté par l’enrichissement', async () => {
    const { service, contacts } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    contacts.enrichContact.mockResolvedValueOnce(success({ ...contact, credits_remaining: 9, credits_debited: 1 }))
    expect((await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal)).creditsDebited).toBe(1)
  })

  it('un débit NON rapporté se dit « non mesuré » — aucun `creditsDebited`, jamais 0', async () => {
    const { service, contacts } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    contacts.enrichContact.mockResolvedValueOnce(success({ ...contact, credits_remaining: 9 }))
    const res = await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal)
    expect(res.creditsDebited).toBeUndefined()
    expect(res.reason).toBe(DEBIT_NOT_REPORTED)
  })
})

describe('ActionRouterService — D4 : enrichissement EN FILE (202 + suivi, comme le bouton de l’écran)', () => {
  function jobsPort() {
    return {
      enqueue: jest.fn().mockResolvedValue({ accepted: true, jobId: 'enrich-c1', reservationAttached: true }),
      observe: jest.fn(),
    }
  }

  it('met en file avec la réservation du runner et rend `queued` — la cascade ne tient pas l’appel', async () => {
    const enrichmentJobs = jobsPort()
    const { service, contacts } = build({ ports: { enrichmentJobs } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch({ type: 'enrich_contact', contactId: 'c1', mode: 'queued' }, principal, {
      reservationReference: 'card_t_0',
    })

    expect(enrichmentJobs.enqueue).toHaveBeenCalledWith({
      contactId: 'c1',
      userId: 'user-1',
      firstName: 'Jean',
      lastName: 'Dupont',
      organizationName: 'Acme Group',
      reservationReference: 'card_t_0',
      reservationWorkspaceId: 'ws-1',
    })
    expect(contacts.enrichContact).not.toHaveBeenCalled()
    expect(res).toEqual({ type: 'enrich_contact', status: 'queued', externalRef: 'enrich-c1' })
  })

  it('un refus connu d’avance (crédits épuisés) est sauté — 0 débité', async () => {
    const enrichmentJobs = jobsPort()
    enrichmentJobs.enqueue.mockResolvedValueOnce({ accepted: false, code: 'insufficient_credits', message: 'Épuisés.' })
    const { service, contacts } = build({ ports: { enrichmentJobs } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    const res = await service.dispatch({ type: 'enrich_contact', contactId: 'c1', mode: 'queued' }, principal)
    expect(res).toMatchObject({ status: 'skipped', creditsDebited: 0 })
  })

  it.each([
    [{ state: 'running', jobId: 'enrich-c1' }, { status: 'queued' }],
    [
      { state: 'done', jobId: 'enrich-c1', creditsDebited: 1 },
      { status: 'done', creditsDebited: 1 },
    ],
    [
      { state: 'done', jobId: 'enrich-c1', creditsDebited: 0 },
      { status: 'done', creditsDebited: 0 },
    ],
    [
      { state: 'done', jobId: 'enrich-c1', creditsDebited: null },
      { status: 'done', reason: DEBIT_NOT_REPORTED },
    ],
    [
      { state: 'failed', jobId: 'enrich-c1', code: 'enrichment_unavailable', message: 'x' },
      { status: 'failed', creditsDebited: 0 },
    ],
    [{ state: 'unknown', jobId: 'enrich-c1' }, { status: 'unknown' }],
  ])('observe %j → %j, sans jamais relancer la recherche', async (seen, expected) => {
    const enrichmentJobs = jobsPort()
    enrichmentJobs.observe.mockResolvedValueOnce(seen)
    const { service } = build({ ports: { enrichmentJobs } })
    const res = await service.observe({ type: 'enrich_contact', contactId: 'c1', mode: 'queued' }, principal)
    expect(res).toMatchObject(expected)
    expect(enrichmentJobs.enqueue).not.toHaveBeenCalled()
  })
})

describe('ActionRouterService — #1931 : les cinq intents des cartes de Laura', () => {
  it('generate_message : le TEXTE du brouillon, rien d’envoyé', async () => {
    const messageDrafts = { generate: jest.fn().mockResolvedValue({ subject: 'Suite', body: 'Bonjour Jean' }) }
    const { service, contacts } = build({ ports: { messageDrafts } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    const res = await service.dispatch(
      { type: 'generate_message', contactId: 'c1', channel: 'email', angle: 'Suite POC' },
      principal,
    )
    expect(messageDrafts.generate).toHaveBeenCalledWith({
      userId: 'user-1',
      contactId: 'c1',
      channel: 'email',
      context: 'Suite POC',
    })
    expect(res).toMatchObject({
      status: 'done',
      artifact: { kind: 'message_draft', channel: 'email', subject: 'Suite', body: 'Bonjour Jean', angle: 'Suite POC' },
    })
    expect(contacts.sendEmail).not.toHaveBeenCalled()
  })

  // #3234 (#3211.11) — sans angle donné, l'artefact ne devine rien.
  it('generate_message : sans angle, l’artefact porte `angle: null` (rien deviné)', async () => {
    const messageDrafts = { generate: jest.fn().mockResolvedValue({ subject: 'Suite', body: 'Bonjour Jean' }) }
    const { service, contacts } = build({ ports: { messageDrafts } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    const res = await service.dispatch({ type: 'generate_message', contactId: 'c1', channel: 'email' }, principal)
    expect(res).toMatchObject({ artifact: { angle: null } })
  })

  it('generate_message : le contact de quelqu’un d’autre ne déclenche aucune génération', async () => {
    const messageDrafts = { generate: jest.fn() }
    const { service, contacts } = build({ ports: { messageDrafts } })
    contacts.findOwnedForAction.mockResolvedValueOnce(failure({ code: 'not_found', message: 'introuvable' }))
    const res = await service.dispatch({ type: 'generate_message', contactId: 'c1', channel: 'email' }, principal)
    expect(res.status).toBe('skipped')
    expect(messageDrafts.generate).not.toHaveBeenCalled()
  })

  // #3405.3 — « NE JAMAIS RELANCER UN NO-GO SANS NOUVEAU MOTIF ». Sortir du
  // NO-GO exige déjà un nouveau niveau de sprint (`SprintsService`) : bloquer
  // tant que `sprint = 'no_go'` EST la règle, pas une approximation.
  it('generate_message : un compte en NO-GO ne génère aucun brouillon, et le motif se lit dans le refus', async () => {
    const messageDrafts = { generate: jest.fn() }
    const { service, contacts, accounts } = build({ ports: { messageDrafts } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    accounts.findOne.mockResolvedValueOnce({
      sprint: 'no_go',
      sprint_reason: 'Direction informatique verrouillée',
    } as AccountEntity)

    const res = await service.dispatch({ type: 'generate_message', contactId: 'c1', channel: 'email' }, principal)

    expect(res.status).toBe('skipped')
    expect(res.reason).toMatch(/no-go/i)
    expect(res.reason).toMatch(/Direction informatique verrouillée/)
    expect(messageDrafts.generate).not.toHaveBeenCalled()
  })

  it('generate_message : un compte HORS no-go (même après y être passé) génère normalement', async () => {
    const messageDrafts = { generate: jest.fn().mockResolvedValue({ subject: null, body: 'Bonjour' }) }
    const { service, contacts, accounts } = build({ ports: { messageDrafts } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    accounts.findOne.mockResolvedValueOnce({ sprint: 'focus', sprint_reason: null } as AccountEntity)

    const res = await service.dispatch({ type: 'generate_message', contactId: 'c1', channel: 'email' }, principal)

    expect(res.status).toBe('done')
    expect(messageDrafts.generate).toHaveBeenCalled()
  })

  it('create_mail_draft : un brouillon — « aucun message n’a été envoyé »', async () => {
    const mailDrafts = {
      createDraft: jest
        .fn()
        .mockResolvedValue({ draftId: 'd-1', messageId: 'm-1', threadId: 't-1', webUrl: 'https://mail.example/d-1' }),
      deleteDraft: jest.fn(),
    }
    const { service } = build({ ports: { mailDrafts } })
    const res = await service.dispatch(
      { type: 'create_mail_draft', to: 'jean@corp.fr', subject: 'Suite', body: 'Bonjour' },
      principal,
    )
    expect(mailDrafts.createDraft).toHaveBeenCalledWith('user-1', {
      to: 'jean@corp.fr',
      subject: 'Suite',
      body: 'Bonjour',
    })
    expect(res).toMatchObject({ status: 'done', externalRef: 'https://mail.example/d-1' })
    expect(res.reason).toMatch(/aucun message n.a été envoyé/i)
  })

  it('create_mail_draft : #2394.35 — un draftId vide ne dit JAMAIS « déposé »', async () => {
    const mailDrafts = {
      createDraft: jest.fn().mockResolvedValue({ draftId: '', messageId: null, threadId: null, webUrl: null }),
      deleteDraft: jest.fn(),
    }
    const { service } = build({ ports: { mailDrafts } })
    const res = await service.dispatch(
      { type: 'create_mail_draft', to: 'jean@corp.fr', subject: 'Suite', body: 'Bonjour' },
      principal,
    )
    expect(res.status).toBe('failed')
    expect(res.reason).not.toMatch(/aucun message n.a été envoyé/i)
  })

  it('create_mail_draft : #2394.62 — un draftId seul (sans message_id ni thread_id) ne dit JAMAIS « déposé »', async () => {
    const mailDrafts = {
      createDraft: jest
        .fn()
        .mockResolvedValue({ draftId: 'd-1', messageId: null, threadId: null, webUrl: 'https://mail.example/d-1' }),
      deleteDraft: jest.fn(),
    }
    const { service } = build({ ports: { mailDrafts } })
    const res = await service.dispatch(
      { type: 'create_mail_draft', to: 'jean@corp.fr', subject: 'Suite', body: 'Bonjour' },
      principal,
    )
    expect(res.status).toBe('failed')
    expect(res.reason).not.toMatch(/aucun message n.a été envoyé/i)
  })

  // #2277.34 / épopée #2771 — le rollback de `create_mail_draft`.
  it('delete_draft : supprime le brouillon dans la messagerie personnelle', async () => {
    const mailDrafts = {
      createDraft: jest.fn(),
      deleteDraft: jest.fn().mockResolvedValue({ deleted: true }),
    }
    const { service } = build({ ports: { mailDrafts } })
    const res = await service.dispatch({ type: 'delete_draft', targetId: 'draft-1' }, principal)
    expect(mailDrafts.deleteDraft).toHaveBeenCalledWith('user-1', 'draft-1')
    expect(res).toEqual({
      type: 'delete_draft',
      status: 'done',
      externalRef: 'draft-1',
      reason: 'Le brouillon a été supprimé de votre messagerie.',
    })
  })

  it('delete_draft : un brouillon déjà supprimé (idempotent) est un `skipped`, jamais un échec', async () => {
    const mailDrafts = { createDraft: jest.fn(), deleteDraft: jest.fn().mockResolvedValue({ deleted: false }) }
    const { service } = build({ ports: { mailDrafts } })
    const res = await service.dispatch({ type: 'delete_draft', targetId: 'draft-x' }, principal)
    expect(res).toEqual({
      type: 'delete_draft',
      status: 'skipped',
      reason: "Ce brouillon n'existe plus — rien à supprimer.",
    })
  })

  it('delete_draft : capacité absente → `skipped`, jamais un succès silencieux', async () => {
    const { service } = build()
    const res = await service.dispatch({ type: 'delete_draft', targetId: 'draft-1' }, principal)
    expect(res).toEqual({ type: 'delete_draft', status: 'skipped', reason: 'Messagerie indisponible.' })
  })

  it('update_routine : seuls les champs présents voyagent ; un patch vide ne touche rien', async () => {
    const routines = { update: jest.fn().mockResolvedValue({ enabled: true }) }
    const { service } = build({ ports: { routines } })
    await service.dispatch({ type: 'update_routine', key: 'morning_brief', enabled: true, hour: 8 }, principal)
    expect(routines.update).toHaveBeenCalledWith('user-1', 'morning_brief', { enabled: true, hour: 8 })
    const empty = await service.dispatch({ type: 'update_routine', key: 'morning_brief' }, principal)
    expect(empty.status).toBe('skipped')
    expect(routines.update).toHaveBeenCalledTimes(1)
  })

  function settingsPort() {
    return {
      notificationFields: jest.fn().mockResolvedValue([
        { field: 'weekly_digest', label: 'Digest', type: 'bool', value: false },
        { field: 'proactivity_cap', label: 'Plafond', type: 'int', value: 3, min: 1, max: 5 },
      ]),
      writeNotification: jest.fn().mockResolvedValue(undefined),
      pipelineFields: jest
        .fn()
        .mockResolvedValue([{ field: 'qualified', label: 'Qualification', type: 'int', value: 14, min: 1, max: 90 }]),
      writePipelineStage: jest.fn().mockResolvedValue(undefined),
    }
  }

  it('update_setting : un interrupteur DU CATALOGUE s’écrit', async () => {
    const settings = settingsPort()
    const { service } = build({ ports: { settings } })
    const res = await service.dispatch(
      { type: 'update_setting', screen: '/settings/notifications', field: 'weekly_digest', newValue: true },
      principal,
    )
    expect(settings.writeNotification).toHaveBeenCalledWith('user-1', 'weekly_digest', true)
    expect(res.status).toBe('done')
  })

  it.each([
    [{ field: 'email_language', newValue: true }, 'hors catalogue'],
    [{ field: 'weekly_digest', newValue: 3 }, 'mauvais type'],
    [{ field: 'proactivity_cap', newValue: 9 }, 'borne dépassée'],
  ])('update_setting : %j (%s) → refusé, rien écrit', async (patch, _why) => {
    const settings = settingsPort()
    const { service } = build({ ports: { settings } })
    const res = await service.dispatch(
      { type: 'update_setting', screen: '/settings/notifications', ...patch } as never,
      principal,
    )
    expect(res.status).toBe('skipped')
    expect(settings.writeNotification).not.toHaveBeenCalled()
  })

  it('update_setting : la durée cible du pipe exige un responsable d’équipe — comme sa route', async () => {
    const settings = settingsPort()
    const seller = build({ ports: { settings }, role: 'sales' })
    const refused = await seller.service.dispatch(
      { type: 'update_setting', screen: '/settings/pipeline', field: 'qualified', newValue: 10 },
      principal,
    )
    expect(refused.status).toBe('skipped')
    expect(settings.writePipelineStage).not.toHaveBeenCalled()

    const owner = build({ ports: { settings }, role: 'owner' })
    const written = await owner.service.dispatch(
      { type: 'update_setting', screen: '/settings/pipeline', field: 'qualified', newValue: 10 },
      principal,
    )
    expect(written.status).toBe('done')
    expect(settings.writePipelineStage).toHaveBeenCalledWith('ws-1', 'qualified', 10)
  })

  // #2170.43 — arbitrage Louis 01/11 : `sales_ops` GARDE le réglage des durées cibles (team:manage).
  it('update_setting : un responsable d’agence (sales_ops) garde le réglage du seuil d’étape', async () => {
    const settings = settingsPort()
    const lead = build({ ports: { settings }, role: 'sales_ops' })
    const written = await lead.service.dispatch(
      { type: 'update_setting', screen: '/settings/pipeline', field: 'qualified', newValue: 10 },
      principal,
    )
    expect(written.status).toBe('done')
    expect(settings.writePipelineStage).toHaveBeenCalledWith('ws-1', 'qualified', 10)
  })

  it('update_setting : un écran que le catalogue ne déclare pas écrivable est refusé', async () => {
    const settings = settingsPort()
    const { service } = build({ ports: { settings } })
    const res = await service.dispatch(
      { type: 'update_setting', screen: '/settings/billing', field: 'plan', newValue: true },
      principal,
    )
    expect(res.status).toBe('skipped')
    expect(settings.notificationFields).not.toHaveBeenCalled()
  })

  it('pin_memory_fact : un compte hors espace n’est pas épinglé ; sinon la porte de la mémoire, bornée à l’espace', async () => {
    const memory = { pinFact: jest.fn().mockResolvedValue({ id: 'mem-1' }) }
    const { service, accounts } = build({ ports: { memory } })
    accounts.findOne.mockResolvedValueOnce(null)
    const refused = await service.dispatch(
      { type: 'pin_memory_fact', fact: 'Facturation à 45 jours', accountId: '33333333-3333-4333-8333-333333333333' },
      principal,
    )
    expect(refused.status).toBe('skipped')
    expect(memory.pinFact).not.toHaveBeenCalled()

    const pinned = await service.dispatch({ type: 'pin_memory_fact', fact: 'Facturation à 45 jours' }, principal)
    expect(memory.pinFact).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'ws-1',
      accountId: null,
      fact: 'Facturation à 45 jours',
    })
    expect(pinned).toMatchObject({ status: 'done', externalRef: 'mem-1' })
  })

  it('une capacité ABSENTE se dit « indisponible » — jamais un succès silencieux', async () => {
    const { service, contacts } = build()
    contacts.findOwnedForAction.mockResolvedValue(success(contact))
    const intents = [
      { type: 'generate_message', contactId: 'c1', channel: 'email' },
      { type: 'create_mail_draft', to: 'jean@corp.fr', subject: 'x', body: 'y' },
      { type: 'update_routine', key: 'morning_brief', enabled: true },
      { type: 'update_setting', screen: '/settings/notifications', field: 'weekly_digest', newValue: true },
      { type: 'pin_memory_fact', fact: 'x' },
    ] as const
    for (const intent of intents) {
      expect((await service.dispatch(intent, principal)).status).toBe('skipped')
    }
  })
})

/**
 * #3076 (épopée #2858) — `update_opportunity` applique le diff FIGÉ d'une carte
 * `propose_opportunity_update`, champ par champ, par les MÊMES méthodes que les
 * routes de l'écran de l'opportunité.
 */
describe('ActionRouterService — update_opportunity (#3076)', () => {
  function projectsPort() {
    return {
      updateStage: jest.fn().mockResolvedValue(true),
      updateAmount: jest.fn().mockResolvedValue(true),
      updateNextStep: jest.fn().mockResolvedValue(true),
      updateRisk: jest.fn().mockResolvedValue(true),
    }
  }

  it('applique chaque champ du diff, par sa MÊME méthode que la route directe', async () => {
    const projects = projectsPort()
    const { service } = build({ ports: { projects } })
    const res = await service.dispatch(
      {
        type: 'update_opportunity',
        projectId: 'proj-1',
        projectLabel: 'RECETTE 1889',
        changes: [
          { field: 'stage', next: 'negotiation' },
          { field: 'estimated_amount', next: 25000 },
          { field: 'next_step', next: 'Envoyer le devis' },
          { field: 'risk', next: 'Budget non voté' },
        ],
      },
      principal,
    )
    expect(projects.updateStage).toHaveBeenCalledWith('ws-1', 'user-1', 'proj-1', 'negotiation')
    expect(projects.updateAmount).toHaveBeenCalledWith('ws-1', 'proj-1', 25000)
    expect(projects.updateNextStep).toHaveBeenCalledWith('ws-1', 'proj-1', 'Envoyer le devis')
    expect(projects.updateRisk).toHaveBeenCalledWith('ws-1', 'proj-1', 'Budget non voté')
    expect(res).toEqual({ type: 'update_opportunity', status: 'done', externalRef: 'proj-1' })
  })

  it('opportunité hors espace → `skipped`, jamais un succès silencieux', async () => {
    const projects = projectsPort()
    projects.updateStage.mockResolvedValue(false)
    const { service } = build({ ports: { projects } })
    const res = await service.dispatch(
      {
        type: 'update_opportunity',
        projectId: 'proj-x',
        projectLabel: 'X',
        changes: [{ field: 'stage', next: 'qualified' }],
      },
      principal,
    )
    expect(res).toEqual({
      type: 'update_opportunity',
      status: 'skipped',
      reason: 'Opportunité introuvable dans votre espace.',
    })
  })

  it('capacité absente → `skipped`, jamais un succès silencieux', async () => {
    const { service } = build()
    const res = await service.dispatch(
      {
        type: 'update_opportunity',
        projectId: 'proj-1',
        projectLabel: 'X',
        changes: [{ field: 'stage', next: 'qualified' }],
      },
      principal,
    )
    expect(res).toEqual({ type: 'update_opportunity', status: 'skipped', reason: 'Opportunités indisponibles.' })
  })
})

/**
 * D1 — revue de sécurité du lot Action OS (13/09/2026) : LE DROIT PROPRE À L'EFFET
 * SE VÉRIFIE À LA PORTE.
 *
 * Chaque route directe exige le droit de son effet : `messages:send` pour un
 * envoi (`contacts.controller.ts`), `contacts:enrich` pour une recherche de
 * coordonnées, `data:export` pour une écriture CRM (`crm.controller.ts`). Le
 * routeur, lui, ne vérifiait que la PROPRIÉTÉ du contact — et depuis L2 une
 * approbation de l'Action Center exécute ses intents : un siège sans le droit
 * (lecteur, recruteur, finance) faisait partir un e-mail en approuvant sa propre
 * demande. `POST actions/dispatch` avait le même trou, antérieur au lot. Une
 * seule porte, donc une seule vérification, avec la même règle que la garde
 * HTTP (`can` : le rôle, puis les droits accordés en propre).
 */
describe('ActionRouterService — le droit propre à l’effet se vérifie à la porte (D1)', () => {
  const sent = success({ contact_id: 'c1', sent_to: 'jean@corp.fr', email_sent_at: '2026-07-16T00:00:00.000Z' })

  it('un siège SANS `messages:send` n’envoie pas : `skipped`, raison nommée, aucun envoi', async () => {
    const { service, contacts } = build({ role: 'recruiter' })
    const res = await service.dispatch({ type: 'send_email', contactId: 'c1' }, principal)
    expect(res).toEqual({ type: 'send_email', status: 'skipped', reason: 'Votre rôle ne permet pas cette action.' })
    expect(contacts.sendEmail).not.toHaveBeenCalled()
  })

  it('un lecteur n’écrit pas dans le CRM et ne lance aucune recherche payante', async () => {
    const { service, contacts, crm } = build({ role: 'viewer' })
    const results = [
      await service.dispatch({ type: 'create_crm_note', contactId: 'c1', note: 'x', crmRecordId: 'hs-77' }, principal),
      await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' }, principal),
      await service.dispatch({ type: 'enrich_contact', contactId: 'c1' }, principal),
    ]
    expect(results.map(result => result.status)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(crm.logActivity).not.toHaveBeenCalled()
    expect(crm.exportContact).not.toHaveBeenCalled()
    expect(contacts.findOwnedForAction).not.toHaveBeenCalled()
    expect(contacts.enrichContact).not.toHaveBeenCalled()
  })

  it('un refus ne réclame aucune clé d’idempotence : rien n’a été tenté', async () => {
    const { service, accounts } = build({ role: 'viewer' })
    await service.dispatch({ type: 'send_email', contactId: 'c1', idempotencyKey: 'run-1:send_recap:1' }, principal)
    expect(accounts.query).not.toHaveBeenCalled()
  })

  it('un droit accordé EN PROPRE suffit — la même règle que la garde HTTP', async () => {
    const { service, contacts, workspaceContext } = build({ role: 'recruiter', extra: ['messages:send'] })
    contacts.sendEmail.mockResolvedValueOnce(sent)
    const res = await service.dispatch({ type: 'send_email', contactId: 'c1' }, principal)
    expect(res.status).toBe('done')
    expect(workspaceContext.extraPermissionsOf).toHaveBeenCalledWith('ws-1', 'user-1')
  })

  it('n’attrape pas ce qu’elle ne vise pas — un geste INTERNE reste permis, le rôle qui a le droit ne relit rien', async () => {
    const viewer = build({ role: 'viewer' })
    expect((await viewer.service.dispatch({ type: 'notify_user', title: 'Signal' }, principal)).status).toBe('done')

    const sales = build({ role: 'sales' })
    sales.contacts.sendEmail.mockResolvedValueOnce(sent)
    expect((await sales.service.dispatch({ type: 'send_email', contactId: 'c1' }, principal)).status).toBe('done')
    expect(sales.workspaceContext.extraPermissionsOf).not.toHaveBeenCalled()
  })

  /**
   * #2081.14 — la règle d'espace « l'export est réservé aux administrateurs »
   * tient aussi par Laura : `create_crm_task` POUSSE la fiche du contact dans
   * le CRM (le même `exportContact` que `POST crm/hubspot/export`), c'est une
   * SORTIE de données. Sans ce contrôle, la règle se contournait par une carte.
   *
   * DÉCISION Louis 19/09/2026 — une NOTE sur une fiche CRM existante est un
   * versement (comme l'appel versé au CRM), pas une sortie : elle reste
   * ouverte aux membres sous la même règle.
   */
  it('#2081.14 — NON : la règle d’espace retire l’export d’une fiche vers le CRM, refus NOMMÉ, rien ne part', async () => {
    const { service, crm } = build({ role: 'sales', exportPolicy: 'admins' })
    const task = await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' }, principal)
    expect(task.status).toBe('skipped')
    expect(task.reason).toMatch(/^Réservé par la règle d’espace : /)
    expect(crm.exportContact).not.toHaveBeenCalled()
  })

  it('#2081.14 — décision 19/09 : une note versée au CRM n’est PAS une sortie, elle part sous la même règle', async () => {
    const { service, crm, contacts } = build({ role: 'sales', exportPolicy: 'admins' })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
    const note = await service.dispatch(
      { type: 'create_crm_note', contactId: 'c1', note: 'x', crmRecordId: 'hs-77' },
      principal,
    )
    expect(note).toMatchObject({ status: 'done', externalRef: 'hs-77' })
    expect(crm.logActivity).toHaveBeenCalled()
  })

  it('#2081.14 — la règle ne vise que l’export : un e-mail part, un administrateur exporte', async () => {
    const sales = build({ role: 'sales', exportPolicy: 'admins' })
    sales.contacts.sendEmail.mockResolvedValueOnce(sent)
    expect((await sales.service.dispatch({ type: 'send_email', contactId: 'c1' }, principal)).status).toBe('done')

    const admin = build({ role: 'admin', exportPolicy: 'admins' })
    admin.contacts.findOwnedForAction.mockResolvedValue(contact)
    const res = await admin.service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot' },
      principal,
    )
    expect(res.reason ?? '').not.toMatch(/règle d’espace/)
  })
})

/**
 * #2449 — LE NIVEAU D'ACTION EST UNE PORTE, ET ELLE EST SUR LE CHEMIN.
 *
 * Ces tests ne vérifient pas la porte (elle a les siens, `copilot-action-gate.spec.ts`) :
 * ils vérifient qu'elle est APPELÉE, au seul endroit par lequel passent la route
 * `actions/dispatch`, les cartes de Laura, les workflows et leurs approbations — et
 * qu'un appelant qui ne déclare AUCUN niveau garde le chemin exact qu'il avait.
 */
describe('ActionRouterService — #2449 : le niveau d’action autorise ou refuse l’écriture', () => {
  it('#2449.3-.7 — « répondre seulement » : rien n’est écrit, le service en aval n’est jamais appelé', async () => {
    const { service, contacts } = build()

    const res = await service.dispatch(
      { type: 'send_email', contactId: 'c1' },
      { ...principal, actionLevel: 'respond_only' },
    )

    expect(res.status).toBe('skipped')
    expect(contacts.sendEmail).not.toHaveBeenCalled()
  })

  it('#2449.5 — « répondre seulement » ne crée aucune tâche CRM', async () => {
    const { service, crm } = build()

    const res = await service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot', note: 'Rappeler' },
      { ...principal, actionLevel: 'respond_only' },
    )

    expect(res.status).toBe('skipped')
    expect(crm.exportContact).not.toHaveBeenCalled()
  })

  it('#2449.8-.15 — « préparer » refuse ce qui sortirait de BellumAI', async () => {
    const { service, crm } = build()

    const res = await service.dispatch(
      { type: 'create_crm_note', contactId: 'c1', note: 'vu au salon' },
      { ...principal, actionLevel: 'prepare' },
    )

    expect(res.status).toBe('skipped')
    expect(crm.logActivity).not.toHaveBeenCalled()
  })

  it('#2449.8-.15 — TÉMOIN POSITIF : « préparer » laisse passer une écriture INTERNE', async () => {
    const { service, notifier } = build()

    const res = await service.dispatch(
      { type: 'notify_user', title: 'Trois comptes à relancer' },
      { ...principal, actionLevel: 'prepare' },
    )

    expect(res.status).toBe('done')
    expect(notifier.notify).toHaveBeenCalled()
  })

  it('#2449.18 — « exécuter » sans geste utilisateur retient l’écriture CRM (jamais un échec)', async () => {
    const { service, crm } = build()

    const res = await service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot', note: 'Rappeler' },
      { ...principal, actionLevel: 'execute', origin: 'system' },
    )

    expect(res.status).toBe('awaiting_approval')
    expect(crm.exportContact).not.toHaveBeenCalled()
  })

  it('#2449.18 — TÉMOIN POSITIF : le même geste, sur un CLIC, passe', async () => {
    const { service, crm, contacts } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'hubspot', note: 'Rappeler' },
      { ...principal, actionLevel: 'execute', origin: 'user' },
    )

    expect(res.status).toBe('done')
    expect(crm.exportContact).toHaveBeenCalled()
  })

  it('#2449.26-.31 — « automatiser » sans les six conditions mesurées est refusé', async () => {
    const { service, notifier } = build()

    const res = await service.dispatch(
      { type: 'notify_user', title: 'digest' },
      { ...principal, actionLevel: 'automate', origin: 'system' },
    )

    expect(res.status).toBe('skipped')
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('AUCUN NIVEAU DÉCLARÉ — chemin inchangé : la porte ne se prononce pas', async () => {
    const { service, contacts } = build()
    contacts.sendEmail.mockResolvedValueOnce(
      success({ contact_id: 'c1', sent_to: 'jean@corp.fr', email_sent_at: '2026-07-16T00:00:00.000Z' }),
    )

    const res = await service.dispatch({ type: 'send_email', contactId: 'c1' }, principal)

    expect(res).toEqual({ type: 'send_email', status: 'done', externalRef: 'c1' })
  })

  it('#2449.24 — en LOT, le nombre de cibles est celui du lot, pas 1', async () => {
    const { service } = build()

    const res = await service.dispatchBulk(
      [
        { type: 'pin_memory_fact', fact: 'siège à Lyon' },
        { type: 'pin_memory_fact', fact: 'DSI en poste depuis 2024' },
      ],
      { ...principal, actionLevel: 'execute', origin: 'system' },
    )

    expect(res.results.every(r => r.status === 'awaiting_approval')).toBe(true)
  })

  it('#2400.3 — un MODE gradué SEUL (sans `actionLevel`) décide déjà la porte', async () => {
    const { service, contacts } = build()

    const res = await service.dispatch(
      { type: 'send_email', contactId: 'c1' },
      { ...principal, graduatedMode: 'observe' },
    )

    expect(res.status).toBe('skipped')
    expect(contacts.sendEmail).not.toHaveBeenCalled()
  })

  it('#2400.3 — niveau ET mode déclarés : le PLUS PRUDENT gagne, jamais un élargissement', async () => {
    const { service, notifier } = build()

    // `actionLevel: 'execute'` autoriserait seul (geste interne, gratuit,
    // aucun GO requis) ; `graduatedMode: 'observe'` (le plus prudent des
    // deux) referme la porte — composer ne doit jamais ouvrir plus que ce
    // qu'un niveau déjà déclaré permettait.
    const res = await service.dispatch(
      { type: 'notify_user', title: 'digest' },
      { ...principal, actionLevel: 'execute', graduatedMode: 'observe', origin: 'system' },
    )

    expect(res.status).toBe('skipped')
    expect(notifier.notify).not.toHaveBeenCalled()
  })
})

/**
 * #2400.5 / #2449.29 — LE DRY RUN : ce que CE niveau ferait des gestes RÉELS,
 * sans en exécuter un seul.
 *
 * Une simulation qui emprunterait un autre chemin de code que la production
 * finirait par répondre autre chose qu'elle — c'est exactement l'écart qu'un
 * rapport de simulation est censé fermer. Ici, simuler c'est appeler la MÊME
 * porte : elle est pure, donc elle n'écrit rien par construction, et ces tests
 * le prouvent en vérifiant qu'aucun service en aval n'est touché.
 */
describe('ActionRouterService — #2400.5 : la simulation ne dispatche rien', () => {
  it('rend un verdict par geste, et n’appelle aucun service en aval', async () => {
    const { service, contacts, crm, notifier } = build()

    const report = await service.simulateBulk(
      [
        { type: 'pin_memory_fact', fact: 'siège à Lyon' },
        { type: 'create_crm_note', contactId: 'c1', note: 'vu au salon' },
        { type: 'send_email', contactId: 'c1' },
      ],
      { ...principal, actionLevel: 'execute', origin: 'system' },
    )

    // Les trois demandent un GO, et pas pour les mêmes raisons : le premier
    // parce qu'il fait partie d'un LOT de trois (#2449.24), les deux autres
    // parce qu'ils SORTENT de BellumAI. C'est tout l'intérêt du rapport : il
    // nomme la raison de chacun plutôt que de rendre un « non » global.
    expect(report.gestures.map(g => g.verdict)).toEqual(['needs_go', 'needs_go', 'needs_go'])
    expect(report.gestures[0]).toMatchObject({ intentType: 'pin_memory_fact', because: ['in_bulk'] })
    expect(report.gestures[2]).toMatchObject({ intentType: 'send_email' })
    expect(report.gestures[2]?.verdict === 'needs_go' && report.gestures[2].because).toContain('leaves_bellum')
    expect(report.blocked).toBe(3)
    expect(report.validated).toBe(false)
    expect(contacts.sendEmail).not.toHaveBeenCalled()
    expect(crm.logActivity).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('TÉMOIN POSITIF — un geste interne, unitaire, VALIDE la simulation', async () => {
    const { service } = build()

    const report = await service.simulateBulk([{ type: 'pin_memory_fact', fact: 'siège à Lyon' }], {
      ...principal,
      actionLevel: 'execute',
      origin: 'system',
    })

    expect(report.blocked).toBe(0)
    expect(report.validated).toBe(true)
  })

  it('TÉMOIN POSITIF — le MÊME lot, sur un clic, valide : le GO est le geste de l’utilisateur', async () => {
    const { service } = build()

    const report = await service.simulateBulk(
      [
        { type: 'pin_memory_fact', fact: 'siège à Lyon' },
        { type: 'update_setting', screen: 'profil', field: 'digest', newValue: true },
      ],
      { ...principal, actionLevel: 'execute', origin: 'user' },
    )

    expect(report.blocked).toBe(0)
    expect(report.validated).toBe(true)
  })

  it('le niveau simulé est celui qu’on demande, pas celui du principal par défaut', async () => {
    const { service } = build()

    const report = await service.simulateBulk([{ type: 'pin_memory_fact', fact: 'siège à Lyon' }], {
      ...principal,
      actionLevel: 'respond_only',
      origin: 'user',
    })

    expect(report.level).toBe('respond_only')
    expect(report.gestures[0]?.verdict).toBe('refused')
    expect(report.validated).toBe(false)
  })

  it('#2449.24 — la simulation compte les cibles du LOT, comme le dispatch', async () => {
    const { service } = build()

    const report = await service.simulateBulk(
      [
        { type: 'pin_memory_fact', fact: 'un' },
        { type: 'pin_memory_fact', fact: 'deux' },
      ],
      { ...principal, actionLevel: 'execute', origin: 'system' },
    )

    expect(report.blocked).toBe(2)
  })
})

describe('#4186 — le routeur : une écriture CRM hors HubSpot est CONSIGNÉE par la porte commune', () => {
  it('un clic Pipedrive est écrit ET son résultat consigné — la demande ne reste plus « approuvée » pour toujours', async () => {
    const pipedrive = {
      getStatus: jest.fn().mockResolvedValue({ connected: true }),
      exportContact: jest.fn().mockResolvedValue({ id: 'pd-3', created: true }),
    }
    const gate = { request: jest.fn().mockResolvedValue({ decision: 'write_now', requestId: 'owr-9' }) }
    const { service, contacts } = build({ crm: { gate, doors: { pipedrive } } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch(
      { type: 'create_crm_task', contactId: 'c1', crmProvider: 'pipedrive' },
      principal,
    )

    expect(res).toMatchObject({ status: 'done', externalRef: 'pd-3' })
    expect(gate.request).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'pipedrive', kind: 'export_contact' }),
    )
  })

  it('un CRM non branché répond « skipped » avec sa raison — rien n’est demandé à la porte', async () => {
    const attio = {
      getStatus: jest.fn().mockResolvedValue({ connected: false }),
      exportContact: jest.fn(),
    }
    const gate = { request: jest.fn() }
    const { service, contacts } = build({ crm: { gate, doors: { attio } } })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch({ type: 'create_crm_task', contactId: 'c1', crmProvider: 'attio' }, principal)

    expect(res.status).toBe('skipped')
    expect(gate.request).not.toHaveBeenCalled()
    expect(attio.exportContact).not.toHaveBeenCalled()
  })
})
