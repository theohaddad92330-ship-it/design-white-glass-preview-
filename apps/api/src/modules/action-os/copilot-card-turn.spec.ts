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
 * #1943 L3 — la conversation CRÉE les cartes d'un tour et les RELIT.
 *
 * `proposeTurn` reçoit le `context.pending_actions` BRUT de l'événement `done` du
 * service IA — une sortie de modèle, donc une donnée non fiable : chaque forme
 * est validée (`pendingChatActionSchema`), le plafond de 3 est recoupé (défense en
 * profondeur, l'orchestrateur coupe déjà à la source), et rien n'est deviné.
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const AUTHOR = '9d359267-0000-4000-8000-000000000001'
const TEAMMATE = '9d359267-0000-4000-8000-000000000003'
const CONTACT = '11111111-1111-4111-8111-111111111111'
const OTHER_CONTACT = '11111111-1111-4111-8111-222222222222'
const TURN_1 = '33333333-3333-4333-8333-333333333331'
const TURN_2 = '33333333-3333-4333-8333-333333333332'
const author = { userId: AUTHOR, email: 'rep@esn.fr' }
const teammate = { userId: TEAMMATE, email: 'mate@esn.fr' }

const draft = (to: string, subject = 'Suite'): PendingChatAction => ({
  action: 'prepare_mail_draft',
  to,
  subject,
  body: 'Bonjour,',
})
const enrich = (contactId = CONTACT): PendingChatAction => ({
  action: 'enrich_contact',
  contact_id: contactId,
  contact_name: 'Claire Dubois',
  organization_name: 'ACME',
})
const reminder = (contactId = CONTACT): PendingChatAction => ({
  action: 'schedule_reminder',
  contact_id: contactId,
  at: '2026-09-14T09:00:00.000Z',
})

function harness(options: { demo?: boolean; dispatch?: jest.Mock } = {}) {
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
  workspaces.rows.push({ id: WS } as unknown as WorkspaceEntity)
  const reservationRows = inMemoryRepository<CreditReservationEntity>()
  const reservations = new CreditReservationService(reservationRows as never)
  const accounts = inMemoryRepository<{ id: string; workspace_id: string }>()
  const contacts = inMemoryRepository<{ id: string; workspace_id: string }>()
  contacts.rows.push({ id: CONTACT, workspace_id: WS }, { id: OTHER_CONTACT, workspace_id: WS })
  const dispatch =
    options.dispatch ??
    jest.fn(async (intent: ActionIntent) => ({
      type: intent.type,
      status: 'done',
      externalRef: 'ref-1',
      creditsDebited: 0,
    }))
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
    isDemoWorkspace: jest.fn(async () => Boolean(options.demo)),
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
    accounts as never,
    contacts as never,
  )
  const turn = (proposals: unknown, turnId = TURN_1, principal = author, conversationId: string | null = 'conv-1') =>
    cards.proposeTurn({ principal, conversationId, turnId, proposals })
  return { cards, runs, reservationRows, dispatch, turn }
}

describe('proposeTurn — une carte par proposition valide, jamais une carte devinée', () => {
  it('persiste les propositions d’un tour, dans leur ordre, la PREMIÈRE marquée principale', async () => {
    const { turn, runs } = harness()
    const { cards, counts } = await turn([draft('a@acme.example'), reminder()])
    expect(cards.map(card => card.proposalIndex)).toEqual([0, 1])
    expect(cards.map(card => card.primary)).toEqual([true, false])
    expect(cards.every(card => card.turnId === TURN_1 && card.conversationId === 'conv-1')).toBe(true)
    expect(runs.rows).toHaveLength(2)
    expect(counts).toMatchObject({ received: 2, persisted: 2, invalid: 0, droppedOverCap: 0 })
  })

  // #3894 — « prépare un message pour Glauco et Adrien » : N contacts nommés = N cartes.
  it('#3894 — deux messages pour deux contacts du même tour donnent DEUX cartes, aucune écrasée', async () => {
    const { turn, runs } = harness()
    const message = (contactId: string): PendingChatAction => ({
      action: 'prepare_message',
      contact_id: contactId,
      contact_name: null,
      channel: 'email',
    })
    const { cards, counts } = await turn([message(CONTACT), message(OTHER_CONTACT)])
    expect(cards.map(card => card.proposalIndex)).toEqual([0, 1])
    expect(runs.rows).toHaveLength(2)
    expect(counts).toMatchObject({ received: 2, persisted: 2, invalid: 0 })
  })

  it('une forme INVALIDE est ignorée et comptée — les autres passent, avec LEUR rang', async () => {
    const { turn, runs } = harness()
    const { cards, counts } = await turn([
      { action: 'enrich_contact', contact_id: CONTACT }, // organization_name manquant : jamais deviné
      'pas un objet',
      draft('b@acme.example'),
    ])
    expect(counts).toMatchObject({ received: 3, invalid: 2, persisted: 1 })
    expect(cards.map(card => card.proposalIndex)).toEqual([2])
    expect(runs.rows).toHaveLength(1)
  })

  it('un `pending_actions` qui n’est pas une liste ne produit aucune carte (et le dit)', async () => {
    const { turn, runs } = harness()
    expect((await turn({ action: 'prepare_mail_draft' })).counts).toMatchObject({ received: 0, invalid: 1 })
    expect((await turn(undefined, TURN_2)).counts).toMatchObject({ received: 0, invalid: 0 })
    expect(runs.rows).toHaveLength(0)
  })

  it('3 cartes au plus : au-delà, les propositions sont abandonnées et comptées (défense en profondeur)', async () => {
    const { turn, runs } = harness()
    const { cards, counts } = await turn([
      draft('a@acme.example'),
      draft('b@acme.example'),
      draft('c@acme.example'),
      draft('d@acme.example'),
    ])
    expect(cards).toHaveLength(3)
    expect(counts.droppedOverCap).toBe(1)
    expect(runs.rows.map(row => row.proposal_index)).toEqual([0, 1, 2])
  })

  it('une carte de navigation garde son rang mais n’est pas persistée', async () => {
    const { turn, runs } = harness()
    const { cards, counts } = await turn([{ action: 'open_screen', route: '/pipeline', label: 'Pipeline' }, reminder()])
    expect(counts).toMatchObject({ navigation: 1, persisted: 1 })
    expect(cards.map(card => [card.proposalIndex, card.primary])).toEqual([[1, false]])
    expect(runs.rows).toHaveLength(1)
  })

  it('I5 — rejouer le MÊME tour ne crée aucun doublon', async () => {
    const { turn, runs } = harness()
    await turn([draft('a@acme.example'), reminder()])
    const replay = await turn([draft('a@acme.example'), reminder()])
    expect(runs.rows).toHaveLength(2)
    expect(replay.counts).toMatchObject({ persisted: 0, reused: 2 })
  })

  it('I7 — proposer ne réserve ni ne débite rien, et ne dispatche rien', async () => {
    const { turn, reservationRows, dispatch } = harness()
    await turn([enrich(), draft('a@acme.example')])
    expect(reservationRows.rows).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('I6 — en démonstration, aucune carte n’est persistée', async () => {
    const { turn, runs } = harness({ demo: true })
    const { cards, counts } = await turn([enrich(), draft('a@acme.example')])
    expect(cards).toEqual([])
    expect(counts).toMatchObject({ demo: true, persisted: 0 })
    expect(runs.rows).toHaveLength(0)
  })
})

describe('supersede — une carte rendue obsolète par un fait DÉTECTABLE', () => {
  it('T1 — une nouvelle carte du même type sur la même cible, dans le même fil, rend l’ancienne obsolète', async () => {
    const { turn, cards } = harness()
    const first = (await turn([enrich()], TURN_1)).cards[0]
    const second = (await turn([enrich()], TURN_2)).cards[0]
    expect((await cards.view(first!.id, author)).state).toBe('superseded')
    expect((await cards.view(first!.id, author)).result?.outcome).toMatch(/plus récente/)
    expect((await cards.view(second!.id, author)).state).toBe('prepared')
  })

  it('T1 n’attrape pas ce qu’il ne vise pas : autre cible, autre type, autre fil, autre auteur, carte déjà lancée', async () => {
    const { turn, cards } = harness()
    const enrichA = (await turn([enrich(CONTACT)], TURN_1)).cards[0]!
    const reminderA = (await turn([reminder(CONTACT)], TURN_1.replace('31', '41'))).cards[0]!
    const otherThread = (await turn([enrich(CONTACT)], TURN_1.replace('31', '51'), author, 'conv-2')).cards[0]!
    const launched = (await turn([draft('x@acme.example')], TURN_1.replace('31', '61'))).cards[0]!
    await cards.confirm(launched.id, author)

    await turn([enrich(OTHER_CONTACT), draft('x@acme.example')], TURN_2)
    await turn([enrich(CONTACT)], TURN_2.replace('32', '72'), teammate)

    expect((await cards.view(enrichA.id, author)).state).toBe('prepared')
    expect((await cards.view(reminderA.id, author)).state).toBe('prepared')
    expect((await cards.view(otherThread.id, author)).state).toBe('prepared')
    expect((await cards.view(launched.id, author)).state).toBe('executed')
  })

  it('T2 — une action déjà EXÉCUTÉE ailleurs rend obsolète la carte identique encore en attente (enrichissement)', async () => {
    const { turn, cards } = harness()
    const waiting = (await turn([enrich()], TURN_1, author, 'conv-1')).cards[0]!
    const elsewhere = (await turn([enrich()], TURN_2, author, 'conv-2')).cards[0]!
    await cards.confirm(elsewhere.id, author)
    expect((await cards.view(waiting.id, author)).state).toBe('superseded')
  })

  it('T2 n’attrape pas ce qu’il ne vise pas : un second RAPPEL au même contact reste légitime', async () => {
    const { turn, cards } = harness()
    const waiting = (await turn([reminder()], TURN_1, author, 'conv-1')).cards[0]!
    const elsewhere = (await turn([reminder()], TURN_2, author, 'conv-2')).cards[0]!
    await cards.confirm(elsewhere.id, author)
    expect((await cards.view(waiting.id, author)).state).toBe('prepared')
  })
})

describe('listForThread — recharger un fil rend ses cartes avec leur état (D1)', () => {
  it('par fil quand il a une clé, par tour sinon — jamais les cartes d’un autre fil', async () => {
    const { turn, cards } = harness()
    const mine = (await turn([draft('a@acme.example'), reminder()], TURN_1, author, 'conv-1')).cards
    await turn([draft('z@acme.example')], TURN_2, author, 'conv-2')
    const byThread = await cards.listForThread(author, { conversationId: 'conv-1', turnIds: [] })
    expect(byThread.map(card => card.id)).toEqual(mine.map(card => card.id))
    expect(byThread.map(card => card.allowedGestures.includes('confirm'))).toEqual([true, true])

    const accountThread = (await turn([reminder(OTHER_CONTACT)], TURN_2.replace('32', '82'), author, null)).cards
    const byTurn = await cards.listForThread(author, { conversationId: null, turnIds: [TURN_2.replace('32', '82')] })
    expect(byTurn.map(card => card.id)).toEqual(accountThread.map(card => card.id))
    expect(await cards.listForThread(author, { conversationId: null, turnIds: [] })).toEqual([])
  })

  it('l’état relu est celui du moment : une carte confirmée se relit « exécutée », sans geste', async () => {
    const { turn, cards } = harness()
    const card = (await turn([draft('a@acme.example')])).cards[0]!
    await cards.confirm(card.id, author)
    const [reread] = await cards.listForThread(author, { conversationId: 'conv-1', turnIds: [] })
    expect(reread?.state).toBe('executed')
    expect(reread?.allowedGestures).toEqual([])
  })
})
