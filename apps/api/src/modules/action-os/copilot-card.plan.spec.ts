import type { ActionIntent, PendingChatAction } from '@bellum/contracts'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { CopilotCardService } from './copilot-card.service'
import { CreditReservationService } from './credit-reservation.service'
import { inMemoryRepository } from './testing/in-memory-repository'
import { WorkflowRunnerService } from './workflow-runner.service'

/**
 * #1950.14 / #1950.18 / #1950.22 — LE PLAN DE LAURA SE LANCE EN ENTIER, CÔTÉ SERVEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1950.14 REVIENT SUR 1950.3, DÉLIBÉRÉMENT (décision Louis 19/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1950.3 : « aucune exécution enchaînée, aucun nouvel état, aucune dépendance ».
 * Désormais `runPlan` enchaîne les étapes d'une réponse dans l'ordre de leur rang
 * (ou la seule première), et `confirm` refuse une étape dont le prérequis
 * DÉCLARÉ a échoué.
 *
 * CE QUI TIENT ENCORE, et que ces tests gardent contre le VRAI moteur
 * (`WorkflowRunnerService` sur un dépôt qui garde ses lignes) :
 *  - le geste de plan passe par `confirm`, carte par carte : mêmes droits (seul
 *    l'auteur), mêmes gardes, même clé d'effet — aucune porte neuve ;
 *  - rien de ce qui écrit dehors (brouillon dans la messagerie, CRM, agenda)
 *    ne part au passage du plan : il reste sur sa carte ;
 *  - sans dépendance déclarée, une étape échouée ne bloque RIEN ;
 *  - un résultat inconnu (timeout) arrête la reprise, sans être dit « échec ».
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const AUTHOR = '9d359267-0000-4000-8000-000000000001'
const TEAMMATE = '9d359267-0000-4000-8000-000000000003'
const CONTACT = '11111111-1111-4111-8111-111111111111'
const TURN = '44444444-4444-4444-8444-444444444444'
const author = { userId: AUTHOR, email: 'rep@esn.fr' }

const MAIL_DRAFT: PendingChatAction = {
  action: 'prepare_mail_draft',
  to: 'claire@acme.example',
  subject: 'Suite',
  body: 'Bonjour Claire,',
}
const EMAIL: PendingChatAction = { action: 'prepare_message', contact_id: CONTACT, channel: 'email' }
const LINKEDIN: PendingChatAction = { action: 'prepare_message', contact_id: CONTACT, channel: 'linkedin' }

type Outcome = 'done' | 'failed' | 'unknown'

/** `outcomes` : l'issue du routeur par canal de message — le reste réussit. */
function harness(outcomes: Partial<Record<'email' | 'linkedin', Outcome>> = {}) {
  const runs = inMemoryRepository<WorkflowRunEntity>({
    unique: {
      name: 'workflow_runs_idempotency_idx',
      clash: (rows, candidate) =>
        rows.some(
          row => row.workspace_id === candidate.workspace_id && row.idempotency_key === candidate.idempotency_key,
        ),
    },
  })
  const approvals = inMemoryRepository<ApprovalRequestEntity>()
  const workspaces = inMemoryRepository<WorkspaceEntity>()
  workspaces.rows.push({ id: WS, approval_spend_threshold: null } as unknown as WorkspaceEntity)
  const reservations = new CreditReservationService(inMemoryRepository<CreditReservationEntity>() as never)
  const contacts = inMemoryRepository<{ id: string; workspace_id: string }>()
  contacts.rows.push({ id: CONTACT, workspace_id: WS })
  const dispatch = jest.fn(async (intent: ActionIntent) => {
    const channel = intent.type === 'generate_message' ? (intent.channel as 'email' | 'linkedin') : null
    const status = (channel && outcomes[channel]) ?? 'done'
    return { type: intent.type, status, externalRef: null, reason: status === 'done' ? 'Fait.' : 'Refusé.' }
  })
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
    isDemoWorkspace: jest.fn(async () => false),
  }
  const runner = new WorkflowRunnerService(
    runs as never,
    approvals as never,
    workspaces as never,
    { dispatch, observe: jest.fn() } as never,
    reservations,
    workspaceContext as never,
  )
  const cards = new CopilotCardService(
    runs as never,
    approvals as never,
    runner,
    reservations,
    inMemoryRepository() as never,
    contacts as never,
  )
  const plan = async (...actions: PendingChatAction[]): Promise<string[]> => {
    const ids: string[] = []
    for (const [index, action] of actions.entries()) {
      const proposed = await cards.propose({
        principal: author,
        conversationId: 'conv-1',
        turnId: TURN,
        proposalIndex: index,
        action,
      })
      ids.push(proposed?.run.id as string)
    }
    return ids
  }
  const dispatchedTypes = () =>
    dispatch.mock.calls.map(([intent]) => `${intent.type}:${intent.type === 'generate_message' ? intent.channel : ''}`)
  return { cards, plan, dispatch, dispatchedTypes }
}

describe('#1950.14 — « Lancer tout le plan » (runPlan, mode `all`)', () => {
  it('enchaîne ce qui se prépare dans Bellum, dans l’ordre du rang ; le brouillon de messagerie reste sur sa porte', async () => {
    const { cards, plan, dispatchedTypes } = harness()
    await plan(EMAIL, MAIL_DRAFT, LINKEDIN)

    const outcome = await cards.runPlan(TURN, author, 'all')

    expect(dispatchedTypes()).toEqual(['generate_message:email', 'generate_message:linkedin'])
    expect(outcome.launched).toEqual([0, 2])
    expect(outcome.cards.map(card => card.state)).toEqual(['executed', 'prepared', 'executed'])
  })

  it('reprise après fermeture : relancer ne rejoue pas ce qui est fait', async () => {
    const { cards, plan, dispatch } = harness()
    await plan(EMAIL, LINKEDIN)
    await cards.runPlan(TURN, author, 'all')
    const again = await cards.runPlan(TURN, author, 'all')
    expect(again.launched).toEqual([])
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('sans dépendance DÉCLARÉE, une étape échouée ne bloque pas la suivante', async () => {
    const { cards, plan, dispatchedTypes } = harness({ email: 'failed' })
    await plan(EMAIL, LINKEDIN)
    const outcome = await cards.runPlan(TURN, author, 'all')
    expect(dispatchedTypes()).toEqual(['generate_message:email', 'generate_message:linkedin'])
    expect(outcome.cards.map(card => card.state)).toEqual(['failed', 'executed'])
  })

  it('un résultat INCONNU arrête la reprise du plan', async () => {
    const { cards, plan, dispatchedTypes } = harness({ email: 'unknown' })
    await plan(EMAIL, LINKEDIN)
    const outcome = await cards.runPlan(TURN, author, 'all')
    expect(dispatchedTypes()).toEqual(['generate_message:email'])
    expect(outcome.cards.map(card => card.state)).toEqual(['unknown_outcome', 'prepared'])
  })

  it('seul l’auteur lance : un coéquipier se voit refuser chaque étape, rien ne part', async () => {
    const { cards, plan, dispatch } = harness()
    await plan(EMAIL, LINKEDIN)
    const outcome = await cards.runPlan(TURN, { userId: TEAMMATE, email: 'mate@esn.fr' }, 'all')
    expect(dispatch).not.toHaveBeenCalled()
    expect(outcome.launched).toEqual([])
    expect(outcome.refused.map(refusal => refusal.rank)).toEqual([0, 1])
  })

  it('un tour sans carte n’a pas de plan', async () => {
    const { cards } = harness()
    await expect(cards.runPlan(TURN, author, 'all')).rejects.toThrow(/Aucun plan/)
  })
})

describe('#1950.18 — « Seulement la 1re étape » (runPlan, mode `first`)', () => {
  it('lance la première étape, et elle seule', async () => {
    const { cards, plan, dispatchedTypes } = harness()
    await plan(EMAIL, LINKEDIN)
    const outcome = await cards.runPlan(TURN, author, 'first')
    expect(dispatchedTypes()).toEqual(['generate_message:email'])
    expect(outcome.cards.map(card => card.state)).toEqual(['executed', 'prepared'])
  })

  it('une première étape qui écrit dehors ne part pas au passage du plan', async () => {
    const { cards, plan, dispatch } = harness()
    await plan(MAIL_DRAFT, EMAIL)
    const outcome = await cards.runPlan(TURN, author, 'first')
    expect(dispatch).not.toHaveBeenCalled()
    expect(outcome.launched).toEqual([])
  })
})

describe('#1950.22 — une étape dont le prérequis DÉCLARÉ a échoué ne démarre pas', () => {
  it('le plan ne la lance pas', async () => {
    const { cards, plan, dispatchedTypes } = harness({ email: 'failed' })
    await plan(EMAIL, { ...LINKEDIN, depends_on: [0] })
    const outcome = await cards.runPlan(TURN, author, 'all')
    expect(dispatchedTypes()).toEqual(['generate_message:email'])
    expect(outcome.cards.map(card => card.state)).toEqual(['failed', 'prepared'])
  })

  it('son propre clic est refusé par le serveur, et il dit par qui', async () => {
    const { cards, plan, dispatch } = harness({ email: 'failed' })
    const [first, second] = await plan(EMAIL, { ...LINKEDIN, depends_on: [0] })
    await cards.confirm(first as string, author)
    await expect(cards.confirm(second as string, author)).rejects.toThrow(/bloquée.*étape 1/)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('un prérequis encore à faire n’empêche pas le clic de la personne (attendre ≠ être bloqué)', async () => {
    const { cards, plan } = harness()
    const [, second] = await plan(EMAIL, { ...LINKEDIN, depends_on: [0] })
    expect((await cards.confirm(second as string, author)).state).toBe('executed')
  })
})
