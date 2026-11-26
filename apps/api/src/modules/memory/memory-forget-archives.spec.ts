import { NotFoundException } from '@nestjs/common'
import { FindOperator } from 'typeorm'
import type { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import type { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import type { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { createMockRepository } from '../../database/test-utils'
import { MemoryService } from './memory.service'

/**
 * #2439.10 — « OUBLIER » UNE MÉMOIRE ARCHIVE, ELLE NE SUPPRIME PAS
 * (décision de Louis du 21/09/2026, QCM).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉROGATION QUE CETTE GARDE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine du dépôt dit « on archive, on ne supprime pas — un fait périmé
 * redevient inconnu, il ne disparaît pas », avec UNE exception nommée :
 * l'effacement RGPD d'une personne à sa demande (c67, #2297). « Effacer une
 * conversation » respectait déjà la règle depuis #2430.9 (`setThreadArchived`).
 * Trois écritures de la mémoire y dérogeaient sans se réclamer de l'exception :
 *
 *  · `unpinFact` — DELETE sur `memory_pinned_facts` ;
 *  · `forgetLedgerEntry` couche `conversations` — DELETE sur `conversation_summaries` ;
 *  · `forgetLedgerEntry` couche `refusals` — DELETE sur `laura_interventions`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX témoins par table, et ils ne se remplacent pas :
 *
 *  1. NON-DESTRUCTION — après l'oubli, la ligne EXISTE encore dans le dépôt
 *     simulé et porte sa date d'archivage. Un DELETE la ferait disparaître.
 *  2. NON-RÉAPPARITION — la même mémoire ne ressort plus par AUCUN chemin de
 *     lecture. C'est la moitié qu'on rate : une ligne archivée que le registre,
 *     le prompt ou un compteur relisent est pire que pas de correctif du tout.
 *
 * Le dépôt simulé HONORE réellement chaque clause de son query builder et
 * chaque critère de ses `where` — et il LÈVE sur ce qu'il ne sait pas simuler,
 * y compris un `FindOperator` inconnu. Une clause ignorée rendrait tout, et la
 * non-réapparition passerait pour un hasard heureux.
 *
 * ⚠️ `readLedger` avale l'échec d'une couche dans `unreadableLayers` : chaque
 * test qui le lit vérifie que cette liste est VIDE. Sans cela, une clause non
 * simulée rendrait la couche vide et le test serait vert pour la mauvaise
 * raison.
 *
 * SAIT DIRE NON — mesuré avant le correctif (`git stash` du service seul) :
 * les six témoins tombent, `1` parce que la ligne a disparu du dépôt, `2` parce
 * que les lectures la rendent encore.
 */

type FactRow = MemoryPinnedFactEntity
type SummaryRow = ConversationSummaryEntity
type TraceRow = LauraInterventionEntity

const ALICE = 'user-alice'
const WORKSPACE = 'ws-esn'

const PINNED = 'Nous ne proposons jamais de freelance.'

/* ------------------------------------------------------------------ */
/*  Le dépôt simulé — il honore ses critères, ou il lève              */
/* ------------------------------------------------------------------ */

/**
 * Un critère d'objet (`where: { … }`), appliqué à une ligne. Les
 * `FindOperator` de TypeORM sont INTERPRÉTÉS, pas ignorés : `IsNull()` est
 * exactement ce que cette garde vérifie sur `archived_at`, et le comparer par
 * `===` le rendrait toujours faux (donc « rien ne sort », donc un vert faux).
 */
function matchesCriteria(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  const entries = Object.entries(where)
  if (entries.length === 0) throw new Error('critère vide — écriture non bornée')
  return entries.every(([column, expected]) => {
    const value = row[column] ?? null
    if (expected instanceof FindOperator) {
      switch (expected.type) {
        case 'isNull':
          return value === null
        case 'not':
          return !matchesCriteria(row, { [column]: expected.child ?? expected.value })
        case 'moreThanOrEqual':
          return value instanceof Date && value.getTime() >= (expected.value as Date).getTime()
        default:
          throw new Error(`opérateur non simulé : ${expected.type}`)
      }
    }
    return value === (expected ?? null)
  })
}

/** Une clause SQL du query builder des faits. Toute clause inconnue LÈVE. */
function appliesToFact(clause: string, row: FactRow, params: Record<string, unknown>): boolean {
  const normalized = clause.replace(/\bf\./g, '').replace(/\s+/g, ' ').trim()
  switch (normalized) {
    case 'id = :id':
      return row.id === params['id']
    case 'workspace_id = :ws':
      return row.workspace_id === params['ws']
    case 'user_id = :viewer':
      return row.user_id === params['viewer']
    // #2439.10 — LA clause de cette garde. Son absence d'une lecture fait
    // ressortir une mémoire oubliée : c'est ce que le témoin 2 attrape.
    case 'archived_at IS NULL':
      return (row.archived_at ?? null) === null
    case '(expires_at IS NULL OR expires_at > now())':
      return row.expires_at === null || row.expires_at.getTime() > Date.now()
    case '(account_id IS NULL OR account_id = :acc)':
      return row.account_id === null || row.account_id === params['acc']
    case "(scope = 'workspace' OR (scope = 'user' AND user_id = :viewer))":
      return row.scope === 'workspace' || (row.scope === 'user' && row.user_id === params['viewer'])
    case 'scope = :scope':
      return row.scope === params['scope']
    case 'contact_id IS NULL AND need_id IS NULL AND consultant_id IS NULL AND mission_id IS NULL':
      return row.contact_id == null && row.need_id == null && row.consultant_id == null && row.mission_id == null
    default:
      throw new Error(`clause non simulée : ${normalized}`)
  }
}

class FakeFactQueryBuilder {
  private readonly clauses: string[] = []
  private readonly params: Record<string, unknown> = {}
  private mode: 'read' | 'delete' | 'update' = 'read'
  private patch: Partial<FactRow> = {}

  constructor(private readonly store: FakeFactStore) {}

  where(clause: string, params: Record<string, unknown> = {}): this {
    return this.andWhere(clause, params)
  }

  andWhere(clause: string, params: Record<string, unknown> = {}): this {
    this.clauses.push(clause)
    Object.assign(this.params, params)
    return this
  }

  orderBy(): this {
    return this
  }

  limit(): this {
    return this
  }

  delete(): this {
    this.mode = 'delete'
    return this
  }

  update(): this {
    this.mode = 'update'
    return this
  }

  set(patch: Partial<FactRow>): this {
    this.patch = patch
    return this
  }

  private matching(): FactRow[] {
    if (this.clauses.length === 0) throw new Error('requête sans where — lecture non bornée')
    return this.store.rows.filter(row => this.clauses.every(clause => appliesToFact(clause, row, this.params)))
  }

  async getMany(): Promise<FactRow[]> {
    return this.matching().sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
  }

  async getOne(): Promise<FactRow | null> {
    return this.matching()[0] ?? null
  }

  async execute(): Promise<{ affected: number; raw: [] }> {
    const hit = this.matching()
    if (this.mode === 'update') {
      for (const row of hit) Object.assign(row, this.patch)
      return { affected: hit.length, raw: [] }
    }
    if (this.mode === 'delete') {
      this.store.destroyed += hit.length
      const gone = new Set(hit)
      this.store.rows.splice(0, this.store.rows.length, ...this.store.rows.filter(row => !gone.has(row)))
      return { affected: gone.size, raw: [] }
    }
    throw new Error('execute sur une lecture : non simulé')
  }
}

class FakeFactStore {
  readonly rows: FactRow[] = []
  /** Combien de lignes une SUPPRESSION a réellement emportées — le témoin 1. */
  destroyed = 0
  private sequence = 1

  readonly manager = {
    transaction: async <T>(work: (em: { withRepository: <R>(repo: R) => R }) => Promise<T>): Promise<T> =>
      work({ withRepository: repo => repo }),
    query: async (): Promise<unknown[]> => [],
  }

  createQueryBuilder(): FakeFactQueryBuilder {
    return new FakeFactQueryBuilder(this)
  }

  create(partial: Partial<FactRow>): FactRow {
    return { ...partial } as FactRow
  }

  async save(row: FactRow): Promise<FactRow> {
    const stored = {
      ...row,
      id: row.id ?? `00000000-0000-4000-8000-${String(this.sequence++).padStart(12, '0')}`,
      kind: row.kind ?? 'fact',
      origin: row.origin ?? 'manual',
      scope: row.scope ?? 'workspace',
      expires_at: row.expires_at ?? null,
      archived_at: row.archived_at ?? null,
      created_at: row.created_at ?? new Date(Date.now() + this.sequence),
    } as FactRow
    this.rows.push(stored)
    return stored
  }

  async findOne(options: { where: Record<string, unknown> }): Promise<FactRow | null> {
    return this.rows.find(row => matchesCriteria(row as never, options.where)) ?? null
  }

  async count(options: { where: Record<string, unknown> }): Promise<number> {
    return this.rows.filter(row => matchesCriteria(row as never, options.where)).length
  }
}

/** Le dépôt simulé des résumés et des traces — mêmes règles, critères d'objet. */
class FakeRowStore<T extends { id?: string }> {
  readonly rows: T[] = []
  destroyed = 0
  private sequence = 1

  create(partial: Partial<T>): T {
    return { ...partial } as T
  }

  async save(row: T): Promise<T> {
    const known = this.rows.find(existing => existing === row || (row.id && existing.id === row.id))
    if (known) {
      Object.assign(known, row)
      return known
    }
    const stored = {
      archived_at: null,
      superseded_at: null,
      ...row,
      id: row.id ?? `row-${this.sequence++}`,
      updated_at: new Date(),
      created_at: new Date(),
    } as unknown as T
    this.rows.push(stored)
    return stored
  }

  async find(options?: { where?: Record<string, unknown> }): Promise<T[]> {
    const where = options?.where
    return where ? this.rows.filter(row => matchesCriteria(row as never, where)) : [...this.rows]
  }

  async findOne(options: { where: Record<string, unknown> }): Promise<T | null> {
    return this.rows.find(row => matchesCriteria(row as never, options.where)) ?? null
  }

  async count(options: { where: Record<string, unknown> }): Promise<number> {
    return this.rows.filter(row => matchesCriteria(row as never, options.where)).length
  }

  async update(where: Record<string, unknown>, patch: Partial<T>): Promise<{ affected: number }> {
    const hit = this.rows.filter(row => matchesCriteria(row as never, where))
    for (const row of hit) Object.assign(row, patch)
    return { affected: hit.length }
  }

  async delete(where: Record<string, unknown>): Promise<{ affected: number }> {
    const hit = new Set(this.rows.filter(row => matchesCriteria(row as never, where)))
    this.destroyed += hit.size
    this.rows.splice(0, this.rows.length, ...this.rows.filter(row => !hit.has(row)))
    return { affected: hit.size }
  }
}

function wire() {
  const facts = new FakeFactStore()
  const summaries = new FakeRowStore<SummaryRow>()
  const interventions = new FakeRowStore<TraceRow>()
  const memory = new MemoryService(
    facts as never,
    // Aucune préférence : ces témoins portent sur les trois tables archivables.
    Object.assign(createMockRepository(), { findOne: jest.fn().mockResolvedValue(null) }) as never,
    summaries as never,
    interventions as never,
    Object.assign(createMockRepository(), { findOne: jest.fn().mockResolvedValue(null) }) as never,
    {
      resolveProfileData: jest.fn().mockResolvedValue({}),
      resolveContext: jest.fn().mockResolvedValue({ canonicalRow: null, ownRow: null }),
    } as never,
    { create: (row: object) => row, save: async (row: object) => row, find: async () => [] } as never,
  )
  return { memory, facts, summaries, interventions }
}

/* ------------------------------------------------------------------ */
/*  1. UN FAIT ÉPINGLÉ                                                */
/* ------------------------------------------------------------------ */

describe('#2439.10 — oublier un fait épinglé', () => {
  async function pinned() {
    const wired = wire()
    const fact = await wired.memory.pinFact({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      fact: PINNED,
      scope: 'workspace',
    })
    return { ...wired, id: fact.id }
  }

  it('témoin 1 — la ligne EXISTE encore et porte sa date d’archivage', async () => {
    const { memory, facts, id } = await pinned()
    await memory.unpinFact({ id, workspaceId: WORKSPACE, userId: ALICE })

    expect(facts.destroyed).toBe(0)
    expect(facts.rows).toHaveLength(1)
    expect(facts.rows[0].id).toBe(id)
    expect(facts.rows[0].fact).toBe(PINNED)
    expect(facts.rows[0].archived_at).toBeInstanceOf(Date)
  })

  it('témoin 2 — la mémoire ne ressort plus : ni écran, ni contexte du modèle, ni registre', async () => {
    const { memory, id } = await pinned()
    expect(await memory.listFacts({ workspaceId: WORKSPACE, userId: ALICE })).toHaveLength(1)

    await memory.unpinFact({ id, workspaceId: WORKSPACE, userId: ALICE })

    // La SEULE lecture de la table (carte Mémoire, `get_memory`, contexte du modèle).
    expect(await memory.listFacts({ workspaceId: WORKSPACE, userId: ALICE })).toEqual([])
    // Le registre, dans ses DEUX vues — et aucune couche illisible : une clause
    // non simulée rendrait la couche vide, ce qui serait un vert faux.
    for (const view of [undefined, 'screen' as const]) {
      const ledger = await memory.readLedger({ userId: ALICE, workspaceId: WORKSPACE, role: 'admin', view })
      expect(ledger.unreadableLayers).toEqual([])
      expect(ledger.entries.filter(entry => entry.layer === 'facts')).toEqual([])
    }
  })

  it('témoin 2 — une ligne archivée ne se modifie plus, ne se re-porte plus, ne s’historise plus', async () => {
    const { memory, id } = await pinned()
    await memory.unpinFact({ id, workspaceId: WORKSPACE, userId: ALICE })

    await expect(memory.factHistory({ id, workspaceId: WORKSPACE, userId: ALICE })).rejects.toThrow(NotFoundException)
    await expect(memory.setFactScope({ id, workspaceId: WORKSPACE, userId: ALICE, scope: 'user' })).rejects.toThrow(
      NotFoundException,
    )
    await expect(
      memory.updateFact({ id, workspaceId: WORKSPACE, userId: ALICE, fact: 'Autre chose', role: 'admin' }),
    ).rejects.toThrow(NotFoundException)
    // Et l'oubli ne se rejoue pas sur une ligne déjà archivée : 404, pas un
    // second succès qui n'a rien fait.
    await expect(memory.unpinFact({ id, workspaceId: WORKSPACE, userId: ALICE })).rejects.toThrow(NotFoundException)
  })

  it('témoin 2 — ré-épingler le MÊME texte crée une ligne neuve, la ligne oubliée n’est pas ressuscitée', async () => {
    const { memory, facts, id } = await pinned()
    await memory.unpinFact({ id, workspaceId: WORKSPACE, userId: ALICE })

    const again = await memory.pinFact({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      fact: PINNED,
      scope: 'workspace',
    })
    expect(again.id).not.toBe(id)
    expect(facts.rows).toHaveLength(2)
    expect(await memory.listFacts({ workspaceId: WORKSPACE, userId: ALICE })).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ */
/*  2. UN RÉSUMÉ DE CONVERSATION                                      */
/* ------------------------------------------------------------------ */

describe('#2439.10 — oublier un résumé de conversation', () => {
  async function summarised() {
    const wired = wire()
    await wired.memory.appendConversationTurn({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: 'general',
      userMessage: 'Où en est ACME ?',
      assistantReply: 'Deux besoins ouverts.',
    })
    return wired
  }

  it('témoin 1 — la ligne EXISTE encore et porte sa date d’archivage', async () => {
    const { memory, summaries } = await summarised()
    await memory.forgetLedgerEntry({ userId: ALICE, workspaceId: WORKSPACE, layer: 'conversations', id: 'general' })

    expect(summaries.destroyed).toBe(0)
    expect(summaries.rows).toHaveLength(1)
    expect(summaries.rows[0].summary).toContain('ACME')
    expect(summaries.rows[0].archived_at).toBeInstanceOf(Date)
  })

  it('témoin 2 — le résumé ne repart plus au modèle, et ne s’affiche plus', async () => {
    const { memory } = await summarised()
    const scope = { userId: ALICE, workspaceId: WORKSPACE, accountId: null, conversationId: 'general' }
    expect(await memory.getConversationSummary(scope)).not.toBeNull()

    await memory.forgetLedgerEntry({ userId: ALICE, workspaceId: WORKSPACE, layer: 'conversations', id: 'general' })

    expect(await memory.getConversationSummary(scope)).toBeNull()
    expect(await memory.getConversationSummaryDetail(scope)).toBeNull()
    expect(await memory.getConversationThreadState(scope)).toBeNull()
    await expect(memory.correctConversationSummary({ ...scope, summary: 'Réécrit' })).rejects.toThrow(NotFoundException)
    const ledger = await memory.readLedger({ userId: ALICE, workspaceId: WORKSPACE })
    expect(ledger.unreadableLayers).toEqual([])
    expect(ledger.entries.filter(entry => entry.layer === 'conversations')).toEqual([])
    // Oublier deux fois la même ligne : 404, jamais un succès muet.
    await expect(
      memory.forgetLedgerEntry({ userId: ALICE, workspaceId: WORKSPACE, layer: 'conversations', id: 'general' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('témoin 2 — le tour suivant repart d’un résumé VIDE, il ne reprend pas celui qui a été oublié', async () => {
    const { memory, summaries } = await summarised()
    await memory.forgetLedgerEntry({ userId: ALICE, workspaceId: WORKSPACE, layer: 'conversations', id: 'general' })

    await memory.appendConversationTurn({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: 'general',
      userMessage: 'Et BÊTA ?',
      assistantReply: 'Un besoin ouvert.',
    })

    expect(summaries.rows).toHaveLength(2)
    const live = summaries.rows.filter(row => row.archived_at === null)
    expect(live).toHaveLength(1)
    expect(live[0].summary).toContain('BÊTA')
    expect(live[0].summary).not.toContain('ACME')
  })
})

/* ------------------------------------------------------------------ */
/*  3. UNE TRACE D'INTERVENTION                                       */
/* ------------------------------------------------------------------ */

describe('#2439.10 — oublier une trace d’intervention', () => {
  async function traced() {
    const wired = wire()
    const row = await wired.interventions.save({
      user_id: ALICE,
      workspace_id: WORKSPACE,
      intervention_key: 'relance_contact_sans_reponse',
      screen: '/chat',
      format: 'bulle',
      priority: 1,
      reaction: 'refused',
      reacted_at: new Date(),
    } as never)
    return { ...wired, id: row.id as string }
  }

  it('témoin 1 — la ligne EXISTE encore et porte sa date d’archivage', async () => {
    const { memory, interventions, id } = await traced()
    await memory.forgetLedgerEntry({ userId: ALICE, workspaceId: WORKSPACE, layer: 'refusals', id })

    expect(interventions.destroyed).toBe(0)
    expect(interventions.rows).toHaveLength(1)
    expect(interventions.rows[0].archived_at).toBeInstanceOf(Date)
  })

  it('témoin 2 — la trace ne ressort plus du registre', async () => {
    const { memory, id } = await traced()
    const before = await memory.readLedger({ userId: ALICE, workspaceId: WORKSPACE })
    expect(before.unreadableLayers).toEqual([])
    expect(before.entries.filter(entry => entry.layer === 'refusals')).toHaveLength(1)

    await memory.forgetLedgerEntry({ userId: ALICE, workspaceId: WORKSPACE, layer: 'refusals', id })

    const after = await memory.readLedger({ userId: ALICE, workspaceId: WORKSPACE })
    expect(after.unreadableLayers).toEqual([])
    expect(after.entries.filter(entry => entry.layer === 'refusals')).toEqual([])
    await expect(
      memory.forgetLedgerEntry({ userId: ALICE, workspaceId: WORKSPACE, layer: 'refusals', id }),
    ).rejects.toThrow(NotFoundException)
  })
})
