/**
 * Épopée #2955 (#2394.52 à .61) — le GATE DE RECETTE que le corps de
 * l'épopée nomme explicitement : « une recette dédiée … un gate de recette
 * couvrant 10 scénarios (thread long, pièces jointes, réponse partielle,
 * mauvais destinataire, token expiré, double clic, annulation…) ».
 *
 * Six lots précédents (nuit-38, soir-s20, g17, n4, V1, R06, T04, 25/09→29/09)
 * avaient chacun confirmé que ce gate ne pouvait pas encore exister : le
 * dispatch réel (writeback CRM depuis un fil) n'était pas construit. Le lot
 * r11 (30/09 08h12) l'a construit — `propose_crm_note` → `create_crm_note` →
 * `ActionRouterService.dispatchCrmNote`. Ce fichier est le gate qui en
 * découle : SEPT des dix scénarios, ceux qui se jouent au niveau du DISPATCH
 * (`ActionRouterService.dispatch`, le point d'entrée PUBLIC — jamais une
 * méthode privée, pour que l'idempotence et le catch-all réels soient sur le
 * chemin). Les trois autres (thread long, pièces jointes, réponse partielle)
 * sont une question de FORME du thread côté compilateur IA, gatées dans
 * `apps/ia/tests/test_2394_thread_action_compiler_recette.py` (#2394.54/.55/.56).
 *
 * Chaque scénario ici a déjà une preuve UNITAIRE dispersée ailleurs (le
 * mauvais destinataire dans `mailbox.service.spec.ts:266-292`, la preuve d'un
 * brouillon dans `action-router.service.spec.ts:1699-1748`, l'idempotence
 * générique sur `notify_user` dans `action-router.service.spec.ts:1094-1109`)
 * — ce fichier ne les duplique pas, il les rejoue TOUTES ENSEMBLE contre le
 * point d'entrée public, dans le vocabulaire exact des dix scénarios nommés,
 * ce qu'aucun fichier existant ne faisait.
 */
import { BadRequestException } from '@nestjs/common'
import { workspaceRuleForbids } from '@bellum/contracts'
import type { WorkspaceRole, WorkspaceRuleGesture } from '@bellum/contracts'
import { success } from '@bellum/utils'
import { connectorFailure } from '../../common/connector-error'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import { createMockRepository } from '../../database/test-utils'
import type { ContactsService } from '../contacts/contacts.service'
import type { CrmService } from '../crm/crm.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ActionRouterService, type ActionPrincipal } from './action-router.service'
import type { ActionRouterPorts } from './card-effect-ports'

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

/** Même forme que `action-router.service.spec.ts::build` — dupliquée à dessein
 *  plutôt qu'importée : ce gate doit pouvoir se lire et se lancer seul. */
function build(ports?: ActionRouterPorts) {
  const contacts = { findOwnedForAction: jest.fn() }
  const crm = {
    getStatus: jest.fn().mockResolvedValue({ configured: true, connected: true }),
    logActivity: jest.fn().mockResolvedValue({ id: 'note-1' }),
    findPresence: jest.fn().mockResolvedValue({
      provider: 'hubspot',
      matched: true,
      contactsCount: 1,
      contacts: [{ id: 'hs-found', name: 'Jean Dupont', email: 'jean@corp.fr', jobTitle: 'DSI' }],
      openDeals: [],
      lastActivityAt: null,
    }),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    workspaceRuleRefusing: jest.fn(async (_workspaceId: string, role: WorkspaceRole, gesture: WorkspaceRuleGesture) =>
      workspaceRuleForbids({ exportPolicy: 'everyone' }, role, gesture),
    ),
  }
  const userActions = createMockRepository<UserActionEntity>()
  userActions.save.mockImplementation(async (e: Partial<UserActionEntity>) => ({ id: 'ua-1', ...e }))
  const accounts = createMockRepository<AccountEntity>()
  const service = new ActionRouterService(
    contacts as unknown as ContactsService,
    crm as unknown as CrmService,
    workspaceContext as unknown as WorkspaceContextService,
    userActions as never,
    accounts as never,
    [],
    null,
    ports,
  )
  return { service, contacts, crm, userActions, accounts }
}

/** Rejoue la contrainte d'unicité `action_dispatch_attempts_dedupe_idx`
 *  (même comportement que `action-router.service.spec.ts::inMemoryAttempts`) —
 *  un mock qui rendrait toujours `{ affected: 1 }` ne prouverait rien du
 *  double clic. */
function inMemoryAttempts() {
  type Row = {
    workspace_id: string
    idempotency_key: string
    status: string | null
    reason: string | null
    external_ref: string | null
  }
  class UniqueViolation extends Error {
    readonly code = '23505'
    constructor() {
      super('duplicate key value violates unique constraint "action_dispatch_attempts_dedupe_idx"')
    }
  }
  const rows: Row[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO action_dispatch_attempts')) {
      const [workspaceId, idempotencyKey] = params as string[]
      if (rows.some(r => r.workspace_id === workspaceId && r.idempotency_key === idempotencyKey)) {
        throw new UniqueViolation()
      }
      rows.push({
        workspace_id: workspaceId,
        idempotency_key: idempotencyKey,
        status: null,
        reason: null,
        external_ref: null,
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
      }
      return []
    }
    if (sql.includes('SELECT') && sql.includes('action_dispatch_attempts')) {
      const [workspaceId, idempotencyKey] = params as string[]
      const row = rows.find(r => r.workspace_id === workspaceId && r.idempotency_key === idempotencyKey)
      return row ? [{ status: row.status, reason: row.reason, external_ref: row.external_ref }] : []
    }
    return []
  })
  return query
}

describe('Épopée #2955 — Thread Action Compiler, gate de recette (#2394.52-.61)', () => {
  it('#2394.52 — brouillon Gmail : déposé avec preuve, jamais envoyé', async () => {
    const mailDrafts = {
      createDraft: jest.fn().mockResolvedValue({
        draftId: 'd-1',
        messageId: 'm-1',
        threadId: 't-1',
        webUrl: 'https://mail.google.com/d-1',
      }),
      deleteDraft: jest.fn(),
    }
    const { service } = build({ mailDrafts })

    const res = await service.dispatch(
      { type: 'create_mail_draft', to: 'jean@corp.fr', subject: 'Suite', body: 'Bonjour', threadId: 't-1' },
      principal,
    )

    expect(res.status).toBe('done')
    expect(res.externalRef).toBe('https://mail.google.com/d-1')
    expect(res.reason).toMatch(/aucun message n.a été envoyé/i)
  })

  it('#2394.53 — brouillon local (BellumAI) : un texte prêt à relire, jamais déposé nulle part', async () => {
    const messageDrafts = {
      generate: jest.fn().mockResolvedValue({ subject: 'Suite', body: 'Bonjour Jean,' }),
    }
    const { service, contacts } = build({ messageDrafts })
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch({ type: 'generate_message', contactId: 'c1', channel: 'email' }, principal)

    expect(res.status).toBe('done')
    expect(res.externalRef).toBeUndefined()
    expect(res.artifact).toMatchObject({ kind: 'message_draft', channel: 'email' })
  })

  it('#2394.57 — mauvais destinataire : refusé, jamais déposé silencieusement', async () => {
    // La détection elle-même (participants connus d'un fil) est prouvée par
    // `mailbox.service.spec.ts:266-292` — ici on prouve que le DISPATCH ne
    // masque ni n'avale ce refus.
    const mailDrafts = {
      createDraft: jest
        .fn()
        .mockRejectedValue(
          new BadRequestException(
            'Ce destinataire n’apparaît pas parmi les personnes connues de ce fil : vérifie l’adresse avant de déposer ce brouillon.',
          ),
        ),
      deleteDraft: jest.fn(),
    }
    const { service } = build({ mailDrafts })

    const res = await service.dispatch(
      { type: 'create_mail_draft', to: 'inconnu@ailleurs.fr', subject: 'Suite', body: 'Bonjour', threadId: 't-1' },
      principal,
    )

    expect(res.status).toBe('failed')
    expect(res.reason).toContain('n’apparaît pas parmi les personnes connues de ce fil')
  })

  it('#2394.58 — token expiré : un échec NOMMÉ, jamais un « déposé » inventé ni un crash', async () => {
    // `classifyProviderError` (`connector-error.ts:118-128`) range un refus de
    // grant sous `authorization_expired` — le code que la messagerie Google
    // relaie déjà pour toute écriture (`google.service.ts::authorizeWrite`).
    const mailDrafts = {
      createDraft: jest.fn().mockRejectedValue(
        connectorFailure({
          code: 'authorization_expired',
          provider: 'google',
          capability: 'mail',
          message: 'Ta messagerie doit être reconnectée pour déposer ce brouillon.',
        }),
      ),
      deleteDraft: jest.fn(),
    }
    const { service } = build({ mailDrafts })

    const res = await service.dispatch(
      { type: 'create_mail_draft', to: 'jean@corp.fr', subject: 'Suite', body: 'Bonjour' },
      principal,
    )

    // Doctrine (`dispatch-failure.ts:18-27`) : seule une requête PARTIE sans
    // réponse est `unknown`. Un grant révoqué n'est jamais parti — `failed`,
    // rejouable sans risque de double dépôt.
    expect(res.status).toBe('failed')
    expect(res.reason).toBe('Ta messagerie doit être reconnectée pour déposer ce brouillon.')
  })

  it('#2394.59 — double clic : un seul brouillon déposé, le second clic rend le même résultat', async () => {
    const mailDrafts = {
      createDraft: jest.fn().mockResolvedValue({
        draftId: 'd-1',
        messageId: 'm-1',
        threadId: 't-1',
        webUrl: 'https://mail.google.com/d-1',
      }),
      deleteDraft: jest.fn(),
    }
    const { service, accounts } = build({ mailDrafts })
    accounts.query.mockImplementation(inMemoryAttempts())

    const intent = {
      type: 'create_mail_draft' as const,
      to: 'jean@corp.fr',
      subject: 'Suite',
      body: 'Bonjour',
      idempotencyKey: 'clic-mail-1',
    }
    const first = await service.dispatch(intent, principal)
    const second = await service.dispatch(intent, principal)

    expect(mailDrafts.createDraft).toHaveBeenCalledTimes(1)
    expect(first.status).toBe('done')
    expect(second).toMatchObject({ status: 'done', externalRef: first.externalRef })
  })

  it('#2394.60 — writeback CRM : la note atteint la fiche déjà présente, jamais une fiche recréée', async () => {
    const { service, contacts, crm } = build()
    contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))

    const res = await service.dispatch(
      { type: 'create_crm_note', contactId: 'c1', note: 'A répondu positivement, relance prévue vendredi.' },
      principal,
    )

    expect(crm.logActivity).toHaveBeenCalledWith(
      'user-1',
      'hs-found',
      'A répondu positivement, relance prévue vendredi.',
      expect.objectContaining({ origin: 'user' }),
    )
    expect(res).toMatchObject({ type: 'create_crm_note', status: 'done', externalRef: 'hs-found' })
  })

  it('#2394.61 — annulation : le brouillon déposé se supprime, le rollback est le MÊME chemin que le dépôt', async () => {
    const mailDrafts = {
      createDraft: jest.fn().mockResolvedValue({
        draftId: 'd-1',
        messageId: 'm-1',
        threadId: 't-1',
        webUrl: 'https://mail.google.com/d-1',
      }),
      deleteDraft: jest.fn().mockResolvedValue({ deleted: true }),
    }
    const { service } = build({ mailDrafts })

    const created = await service.dispatch(
      { type: 'create_mail_draft', to: 'jean@corp.fr', subject: 'Suite', body: 'Bonjour' },
      principal,
    )
    expect(created.status).toBe('done')

    const cancelled = await service.dispatch({ type: 'delete_draft', targetId: 'd-1' }, principal)

    expect(mailDrafts.deleteDraft).toHaveBeenCalledWith('user-1', 'd-1')
    expect(cancelled).toEqual({
      type: 'delete_draft',
      status: 'done',
      externalRef: 'd-1',
      reason: 'Le brouillon a été supprimé de votre messagerie.',
    })
  })
})
