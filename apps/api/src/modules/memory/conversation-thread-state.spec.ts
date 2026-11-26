import type { ConversationThreadState } from '@bellum/contracts'
import { FindOperator } from 'typeorm'
import type { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { createMockRepository } from '../../database/test-utils'
import { MemoryService, parseThreadState } from './memory.service'

/**
 * #1927.10 — l'état structuré d'un fil vit avec son résumé, sur la ligne de SA
 * personne, et part avec le fil.
 *
 * Le faux dépôt HONORE son `where` (même motif que
 * `conversation-summary-isolation.spec.ts`) : une portée oubliée dans une
 * lecture, une écriture ou un effacement fait tomber le test qui la vise, au
 * lieu d'être vraie par vacuité sur un mock qui rend `null` quoi qu'on lui
 * demande.
 */
type Row = ConversationSummaryEntity

class FakeSummaryStore {
  readonly rows: Row[] = []
  private sequence = 1

  private matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([column, expected]) => {
      const actual = (row as unknown as Record<string, unknown>)[column]
      if (expected instanceof FindOperator) {
        if (expected.type === 'isNull') return actual === null || actual === undefined
        throw new Error(`opérateur non simulé : ${expected.type}`)
      }
      return actual === expected
    })
  }

  private bounded(where: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!where || Object.keys(where).length === 0) throw new Error('requête non bornée')
    return where
  }

  async findOne(options: { where?: Record<string, unknown> }): Promise<Row | null> {
    const where = this.bounded(options?.where)
    return this.rows.find(row => this.matches(row, where)) ?? null
  }

  async count(options: { where?: Record<string, unknown> }): Promise<number> {
    const where = this.bounded(options?.where)
    return this.rows.filter(row => this.matches(row, where)).length
  }

  async delete(where: Record<string, unknown>): Promise<{ affected: number }> {
    this.bounded(where)
    const before = this.rows.length
    const kept = this.rows.filter(row => !this.matches(row, where))
    this.rows.splice(0, this.rows.length, ...kept)
    return { affected: before - kept.length }
  }

  create(partial: Partial<Row>): Row {
    return { ...partial } as Row
  }

  async save(row: Row): Promise<Row> {
    const existing = row.id ? this.rows.find(candidate => candidate.id === row.id) : undefined
    if (existing) {
      Object.assign(existing, row)
      return existing
    }
    const inserted = {
      ...row,
      id: `cs-${this.sequence++}`,
      superseded_at: row.superseded_at ?? null,
      thread_state: row.thread_state ?? null,
    } as Row
    this.rows.push(inserted)
    return inserted
  }
}

const ALICE = 'user-alice'
const BOB = 'user-bob'
const WORKSPACE = 'ws-esn'
const GENERAL = 'general'

function state(label = 'ACME Industrie'): ConversationThreadState {
  return {
    version: 1,
    objects: [{ kind: 'account', id: 'acc-1', label }],
    focus: [{ kind: 'account', id: 'acc-1', label }],
    last_list: null,
    searches: [{ tool: 'find_accounts', criteria: { sectors: ['industry'], department: '31' } }],
    proposals: [],
    questions: [],
    ruled_out: [],
    assumptions: [],
    // #2268.1 / #2268.5 / #2268.10
    goal: null,
    excluded: [],
    decisions: [],
    // #2268.12 / #2268.13 / #2268.15
    current_job: null,
    current_step: null,
    next_step: null,
    // #2268.7
    accepted: [],
    // #3178.1 / #3178.2
    persistent_scope: null,
    // #3187.4
    treated_entities: [],
    // #3191.3.12 (LAU-FINAL-197, épopée #3220)
    precautions: [],
    // #193.1
    facets: {},
    // #194.1 / #194.2
    correction: null,
    constraints: [],
    turns: 0,
    // #3223 (lot R17)
    last_account_verdict: null,
  }
}

function buildService(store: FakeSummaryStore): MemoryService {
  return new MemoryService(
    createMockRepository() as never,
    createMockRepository() as never,
    store as never,
    createMockRepository() as never,
    createMockRepository() as never,
    { resolveProfileData: jest.fn().mockResolvedValue({}), resolveContext: jest.fn() } as never,
    // #1916.23 — `events`, le journal des gestes sur la mémoire : 7e paramètre
    // du service depuis main, ajouté par la fusion du 13/09.
    createMockRepository() as never,
  )
}

function turn(userId: string, conversationId: string | null, threadState?: ConversationThreadState | null) {
  return {
    userId,
    workspaceId: WORKSPACE,
    accountId: conversationId ? null : 'acc-1',
    conversationId,
    userMessage: 'Trouve-moi des comptes industriels à Toulouse',
    assistantReply: 'Recherche préparée.',
    threadState,
  }
}

const scope = (userId: string, conversationId: string | null = GENERAL) => ({
  userId,
  workspaceId: WORKSPACE,
  accountId: conversationId ? null : 'acc-1',
  conversationId,
})

describe("l'état du fil, persisté avec la conversation (#1927.10)", () => {
  let store: FakeSummaryStore
  let memory: MemoryService

  beforeEach(() => {
    store = new FakeSummaryStore()
    memory = buildService(store)
  })

  it("s'écrit avec le résumé, sur la ligne de SA personne, et se relit à la réouverture du fil", async () => {
    await memory.appendConversationTurn(turn(ALICE, GENERAL, state()))
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]?.summary).toContain('comptes industriels')
    expect(await memory.getConversationThreadState(scope(ALICE))).toEqual(state())
  })

  it("n'est jamais relu par un collègue du même espace, sur le même fil", async () => {
    await memory.appendConversationTurn(turn(ALICE, GENERAL, state()))
    expect(await memory.getConversationThreadState(scope(BOB))).toBeNull()
  })

  it("un tour qui ne rend PAS d'état ne l'efface pas (service IA d'avant #1927, tour en échec)", async () => {
    await memory.appendConversationTurn(turn(ALICE, GENERAL, state()))
    await memory.appendConversationTurn(turn(ALICE, GENERAL))
    expect(await memory.getConversationThreadState(scope(ALICE))).toEqual(state())
  })

  it('un tour qui rend un état neuf REMPLACE le précédent', async () => {
    await memory.appendConversationTurn(turn(ALICE, GENERAL, state('ACME Industrie')))
    await memory.appendConversationTurn(turn(ALICE, GENERAL, state('Groupe Vallée')))
    expect((await memory.getConversationThreadState(scope(ALICE)))?.focus[0]?.label).toBe('Groupe Vallée')
  })

  it('un état stocké illisible redevient null — jamais une valeur devinée', async () => {
    await memory.appendConversationTurn(turn(ALICE, GENERAL, state()))
    const row = store.rows[0] as Row
    row.thread_state = { version: 2, objects: 'pas une liste' }
    expect(await memory.getConversationThreadState(scope(ALICE))).toBeNull()
  })

  it('supprimer un fil efface son résumé ET son état, pour chaque membre — et seulement ce fil', async () => {
    await memory.appendConversationTurn(turn(ALICE, GENERAL, state()))
    await memory.appendConversationTurn(turn(BOB, GENERAL, state()))
    await memory.appendConversationTurn(turn(ALICE, 'thread-2', state()))

    const forgotten = await memory.forgetConversation({
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
    })

    expect(forgotten).toBe(2)
    expect(store.rows.map(row => row.conversation_id)).toEqual(['thread-2'])
    expect(await memory.getConversationThreadState(scope(ALICE))).toBeNull()
    expect(await memory.getConversationThreadState(scope(ALICE, 'thread-2'))).toEqual(state())
  })

  it("supprimer le fil d'un COMPTE vise la même clé dérivée que son écriture", async () => {
    await memory.appendConversationTurn(turn(ALICE, null, state()))
    expect(store.rows[0]?.conversation_id).toBe('account:acc-1')
    expect(await memory.forgetConversation({ workspaceId: WORKSPACE, accountId: 'acc-1', conversationId: null })).toBe(
      1,
    )
    expect(store.rows).toHaveLength(0)
  })

  it("ne touche jamais le fil d'un AUTRE espace portant la même clé", async () => {
    await memory.appendConversationTurn(turn(ALICE, GENERAL, state()))
    expect(await memory.forgetConversation({ workspaceId: 'ws-autre', accountId: null, conversationId: GENERAL })).toBe(
      0,
    )
    expect(store.rows).toHaveLength(1)
  })
})

describe('parseThreadState — la seule lecture de l’état, dans les deux sens', () => {
  it('rend l’état validé, et retire une clé hors liste blanche', () => {
    const raw = {
      ...state(),
      proposals: [
        { action: 'prepare_mail_draft', target_kind: null, target_id: null, target_label: null, body: 'secret' },
      ],
    }
    const parsed = parseThreadState(raw)
    expect(parsed?.proposals).toEqual([
      { action: 'prepare_mail_draft', target_kind: null, target_id: null, target_label: null },
    ])
  })

  it('rend null pour une absence ou une forme illisible', () => {
    for (const raw of [undefined, null, 'texte', [], { version: 1 }]) {
      expect(parseThreadState(raw)).toBeNull()
    }
  })
})
