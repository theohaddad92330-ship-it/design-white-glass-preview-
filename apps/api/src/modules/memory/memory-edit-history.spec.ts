import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { success } from '@bellum/utils'
import { FindOperator, type Repository } from 'typeorm'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { MemoryFactEventEntity } from '../../database/entities/memory-fact-event.entity'
import type { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { createMockRepository } from '../../database/test-utils'
import type { AccountsService } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { ChatContextService } from '../ia-proxy/chat-context.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { PinFactDto, UpdateFactDto } from './dto/memory.dto'
import { MemoryController } from './memory.controller'
import { MemoryService } from './memory.service'

/**
 * #1916.19 / .22 / .23 / .13 / .16 / .18 / .24 — UNE MÉMOIRE QUI SE MODIFIE, SE
 * DATE APRÈS COUP, RACONTE SON HISTOIRE, ET DIT QUI, D'OÙ ET OÙ ELLE PÈSE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SUITE PROUVE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le service, le contrôleur et le service de contexte du modèle sont les VRAIS ;
 * seules les tables sont simulées, par un dépôt qui APPLIQUE chaque clause et
 * REFUSE celle qu'il ne sait pas simuler (une clause ignorée rendrait tout, et
 * un refus passerait pour un hasard heureux).
 *
 * Les tests NON (droits) : un membre simple ne modifie pas l'élément partagé
 * d'un collègue (403) ; personne ne touche l'élément « moi » d'un collègue, ni
 * ne lit son historique (404, manager comprise) ; un autre espace est hors
 * d'atteinte (404) ; un auteur qui n'est plus membre n'est pas nommé.
 *
 * Qu'elle LIT quelque chose : chaque refus a son témoin — l'auteur et la
 * manager réussissent le MÊME geste sur la MÊME ligne.
 */

type Row = MemoryPinnedFactEntity
type EventRow = MemoryFactEventEntity

const ALICE = 'user-alice'
const BOB = 'user-bob'
/** Une manager de l'espace (rôle `admin`). Alice et Bob sont `member`. */
const CAROL = 'user-carol'
/** Un membre d'une AUTRE ESN. */
const DAVE = 'user-dave'
/** Épinglait dans l'espace, n'en est plus membre. */
const ERIN = 'user-erin'
const WORKSPACE = 'ws-esn'
const OTHER_WORKSPACE = 'ws-concurrent'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'

const WORKSPACE_OF: Record<string, string> = { [DAVE]: OTHER_WORKSPACE }
const ROLE_OF: Record<string, string> = { [CAROL]: 'admin' }
const MEMBERS: Array<{ user_id: string; workspace_id: string; first_name: string }> = [
  { user_id: ALICE, workspace_id: WORKSPACE, first_name: 'Alice' },
  { user_id: BOB, workspace_id: WORKSPACE, first_name: 'Bob' },
  { user_id: CAROL, workspace_id: WORKSPACE, first_name: 'Carol' },
  { user_id: DAVE, workspace_id: OTHER_WORKSPACE, first_name: 'Dave' },
]

const PERSONAL = 'Mon objectif du trimestre : trois signatures à Toulouse.'
const SHARED = 'Nous ne proposons jamais de freelance.'
const DAY = 24 * 60 * 60 * 1000

function applies(clause: string, row: Row, params: Record<string, unknown>): boolean {
  const normalized = clause.replace(/\bf\./g, '').replace(/\s+/g, ' ').trim()
  switch (normalized) {
    case 'workspace_id = :ws':
      return row.workspace_id === params['ws']
    // #2439.10 — une mémoire OUBLIÉE est archivée, pas détruite : toute lecture
    // et toute écriture l'excluent (décision Louis 21/09/2026).
    case 'archived_at IS NULL':
      return (row.archived_at ?? null) === null
    case 'id = :id':
      return row.id === params['id']
    case '(expires_at IS NULL OR expires_at > now())':
      return row.expires_at === null || row.expires_at.getTime() > Date.now()
    case 'account_id = :acc':
      return row.account_id === params['acc']
    case 'account_id IS NULL':
      return row.account_id === null
    case '(account_id IS NULL OR account_id = :acc)':
      return row.account_id === null || row.account_id === params['acc']
    // #1918.1 — les deux portées DURABLES, la clause d'avant à la sémantique près.
    case "(scope = 'workspace' OR (scope = 'user' AND user_id = :viewer))":
      return row.scope === 'workspace' || (row.scope === 'user' && row.user_id === params['viewer'])
    // #1918.2 — la mémoire d'un périmètre PORTÉ par l'appelant, et lui seul.
    case "(scope = 'workspace' OR (scope = 'user' AND user_id = :viewer) OR (scope = 'business_unit' AND business_unit_id IN (:...viewerUnits)))":
      return (
        row.scope === 'workspace' ||
        (row.scope === 'user' && row.user_id === params['viewer']) ||
        (row.scope === 'business_unit' &&
          (params['viewerUnits'] as string[] | undefined)?.includes(row.business_unit_id as string) === true)
      )
    // #1918.5 — la mémoire de CE fil, pour son auteur.
    case "(scope = 'workspace' OR (scope = 'user' AND user_id = :viewer) OR (scope = 'conversation' AND user_id = :viewer AND conversation_id = :viewerThread))":
      return (
        row.scope === 'workspace' ||
        (row.scope === 'user' && row.user_id === params['viewer']) ||
        (row.scope === 'conversation' &&
          row.user_id === params['viewer'] &&
          row.conversation_id === params['viewerThread'])
      )
    // #1918.2 + #1918.5 — les deux à la fois (le tour de chat d'un membre de périmètre).
    case "(scope = 'workspace' OR (scope = 'user' AND user_id = :viewer) OR (scope = 'business_unit' AND business_unit_id IN (:...viewerUnits)) OR (scope = 'conversation' AND user_id = :viewer AND conversation_id = :viewerThread))":
      return (
        row.scope === 'workspace' ||
        (row.scope === 'user' && row.user_id === params['viewer']) ||
        (row.scope === 'business_unit' &&
          (params['viewerUnits'] as string[] | undefined)?.includes(row.business_unit_id as string) === true) ||
        (row.scope === 'conversation' &&
          row.user_id === params['viewer'] &&
          row.conversation_id === params['viewerThread'])
      )
    case 'conversation_id = :conv':
      return row.conversation_id === params['conv']
    case 'business_unit_id = :bu':
      return row.business_unit_id === params['bu']
    case 'scope = :scope':
      return row.scope === params['scope']
    case 'user_id = :viewer':
      return row.user_id === params['viewer']
    // #2260.7 — un doublon est celui du MÊME objet visé (une colonne parmi les
    // quatre), ou d'AUCUN objet visé quand rien n'est demandé.
    case 'contact_id = :objectId':
      return row.contact_id === params['objectId']
    case 'need_id = :objectId':
      return row.need_id === params['objectId']
    case 'consultant_id = :objectId':
      return row.consultant_id === params['objectId']
    case 'mission_id = :objectId':
      return row.mission_id === params['objectId']
    case 'contact_id IS NULL AND need_id IS NULL AND consultant_id IS NULL AND mission_id IS NULL':
      // `== null` : une ligne fabriquée par un fixture d'AVANT ce lot n'a jamais
      // posé ces colonnes (`undefined`), et c'est la MÊME chose que `null` — un
      // objet non écrit vaut « aucun objet visé ».
      return row.contact_id == null && row.need_id == null && row.consultant_id == null && row.mission_id == null
    default:
      throw new Error(`clause non simulée : ${normalized}`)
  }
}

class FakeQueryBuilder {
  private readonly clauses: string[] = []
  private readonly params: Record<string, unknown> = {}
  private mode: 'select' | 'delete' | 'update' = 'select'
  private patch: Partial<Row> = {}

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

  set(patch: Partial<Row>): this {
    this.patch = patch
    return this
  }

  private matching(): Row[] {
    if (this.clauses.length === 0) throw new Error('requête sans where — non bornée')
    return this.store.rows.filter(row => this.clauses.every(clause => applies(clause, row, this.params)))
  }

  async getMany(): Promise<Row[]> {
    if (this.mode !== 'select') throw new Error('getMany hors lecture')
    return this.matching().sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
  }

  async getOne(): Promise<Row | null> {
    if (this.mode !== 'select') throw new Error('getOne hors lecture')
    return this.matching()[0] ?? null
  }

  async execute(): Promise<{ affected: number; raw: [] }> {
    const hit = this.matching()
    if (this.mode === 'update') {
      for (const row of hit) Object.assign(row, this.patch)
      return { affected: hit.length, raw: [] }
    }
    if (this.mode !== 'delete') throw new Error('execute sur une lecture')
    const gone = new Set(hit)
    this.store.rows.splice(0, this.store.rows.length, ...this.store.rows.filter(row => !gone.has(row)))
    // La base : ON DELETE CASCADE emporte l'histoire d'un élément oublié.
    this.store.events.rows = this.store.events.rows.filter(event => !hit.some(row => row.id === event.fact_id))
    return { affected: hit.length, raw: [] }
  }
}

class FakeEventStore {
  rows: EventRow[] = []
  failNextSave = false

  create(partial: Partial<EventRow>): EventRow {
    return { ...partial } as EventRow
  }

  async save(input: EventRow | EventRow[]): Promise<EventRow | EventRow[]> {
    if (this.failNextSave) {
      this.failNextSave = false
      throw new Error('écriture du journal impossible')
    }
    const list = Array.isArray(input) ? input : [input]
    for (const row of list) {
      this.rows.push({ ...row, id: `ev-${this.rows.length + 1}`, created_at: row.created_at ?? new Date() } as EventRow)
    }
    return input
  }

  async find(options: { where: Record<string, unknown> }): Promise<EventRow[]> {
    const entries = Object.entries(options.where)
    if (entries.length === 0) throw new Error('lecture du journal non bornée')
    return this.rows.filter(row =>
      entries.every(([column, expected]) => (row as unknown as Record<string, unknown>)[column] === expected),
    )
  }
}

/** Dépôt simulé qui HONORE ses `where`, ET une transaction qui annule tout si un pas échoue. */
class FakeFactStore {
  readonly rows: Row[] = []
  readonly events = new FakeEventStore()
  private sequence = 1

  readonly manager = {
    transaction: async <T>(work: (em: { withRepository: <R>(repo: R) => R }) => Promise<T>): Promise<T> => {
      const rowsBefore = this.rows.map(row => ({ ...row }))
      const eventsBefore = [...this.events.rows]
      try {
        return await work({ withRepository: repo => repo })
      } catch (error) {
        this.rows.splice(0, this.rows.length, ...rowsBefore)
        this.events.rows = eventsBefore
        throw error
      }
    },
    // Les membres de l'espace × leurs profils, filtrés par les paramètres LIÉS.
    query: async (sql: string, params: unknown[] = []) => {
      if (!/workspace_members/.test(sql)) throw new Error(`requête brute non simulée : ${sql}`)
      const [workspaceId, ids] = params as [string, string[]]
      return MEMBERS.filter(member => member.workspace_id === workspaceId && ids.includes(member.user_id)).map(
        member => ({ userId: member.user_id, firstName: member.first_name, avatarUrl: null }),
      )
    },
  }

  createQueryBuilder(): FakeQueryBuilder {
    return new FakeQueryBuilder(this)
  }

  create(partial: Partial<Row>): Row {
    return { ...partial } as Row
  }

  async save(row: Row): Promise<Row> {
    const stored = {
      ...row,
      id: row.id ?? `00000000-0000-4000-8000-${String(this.sequence++).padStart(12, '0')}`,
      kind: row.kind ?? 'fact',
      origin: row.origin ?? 'manual',
      scope: row.scope ?? 'workspace',
      expires_at: row.expires_at ?? null,
      created_at: row.created_at ?? new Date(Date.now() - 10 * DAY + this.sequence),
    } as Row
    this.rows.push(stored)
    return stored
  }

  private equals(row: Row, where: Record<string, unknown>): boolean {
    const entries = Object.entries(where)
    if (entries.length === 0) throw new Error('critère vide — écriture non bornée')
    return entries.every(([column, expected]) => {
      const value = (row as unknown as Record<string, unknown>)[column] ?? null
      // #2439.10 — `archived_at: IsNull()` est un `FindOperator` : le comparer
      // par `===` le rendrait toujours faux, donc « aucune ligne », donc un vert
      // par vacuité. Un opérateur non simulé LÈVE.
      if (expected instanceof FindOperator) {
        if (expected.type === 'isNull') return value === null
        throw new Error(`opérateur non simulé : ${expected.type}`)
      }
      return value === (expected ?? null)
    })
  }

  async findOne(options: { where: Record<string, unknown> }): Promise<Row | null> {
    return this.rows.find(row => this.equals(row, options.where)) ?? null
  }

  async update(where: Record<string, unknown>, patch: Partial<Row>): Promise<{ affected: number }> {
    const hit = this.rows.filter(row => this.equals(row, where))
    for (const row of hit) Object.assign(row, patch)
    return { affected: hit.length }
  }
}

function member(userId: string): CurrentUserPayload {
  return { userId, email: `${userId}@example.com` } as CurrentUserPayload
}

function wire(store: FakeFactStore) {
  const memory = new MemoryService(
    store as never,
    createMockRepository() as never,
    Object.assign(createMockRepository(), { findOne: jest.fn().mockResolvedValue(null) }) as never,
    createMockRepository() as never,
    createMockRepository() as never,
    {
      resolveProfileData: jest.fn().mockResolvedValue({}),
      resolveContext: jest.fn().mockResolvedValue({ canonicalRow: null, ownRow: null }),
    } as never,
    store.events as never,
  )
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async (userId: string) => ({
      workspaceId: WORKSPACE_OF[userId] ?? WORKSPACE,
      role: ROLE_OF[userId] ?? 'member',
    })),
  } as unknown as WorkspaceContextService
  const controller = new MemoryController(memory, workspaceContext)

  const accounts = {
    findOne: jest.fn().mockResolvedValue(success({ id: ACCOUNT, company_name: 'ACME', raw_analysis: null })),
    listAccountsDigest: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    listCopilotAccountFacts: jest.fn().mockResolvedValue(new Map()),
  } as unknown as AccountsService
  const contacts = { findByAccount: jest.fn().mockResolvedValue([]) } as unknown as ContactsService
  const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) } as unknown as EsnProfileReader
  const crmConnections = {
    findOne: jest.fn().mockResolvedValue(null),
    manager: { query: jest.fn().mockResolvedValue([]) },
  } as unknown as Repository<CrmConnectionEntity>
  const chatContext = new ChatContextService(accounts, contacts, esnProfile, memory, crmConnections)

  return { memory, controller, chatContext }
}

describe('#1916 — modifier, dater, relire : une mémoire lisible', () => {
  let store: FakeFactStore
  let controller: MemoryController
  let chatContext: ChatContextService
  let memory: MemoryService

  beforeEach(async () => {
    store = new FakeFactStore()
    ;({ controller, chatContext, memory } = wire(store))
    await controller.pinFact(member(ALICE), { fact: PERSONAL, scope: 'user' } as PinFactDto)
    await controller.pinFact(member(ALICE), { fact: SHARED, scope: 'workspace', kind: 'correction' } as PinFactDto)
  })

  function rowOf(text: string): Row {
    const row = store.rows.find(candidate => candidate.fact === text)
    if (!row) throw new Error(`aucune ligne pour « ${text} »`)
    return row
  }

  const edit = (userId: string, id: string, body: Record<string, unknown>) =>
    controller.updateFact(member(userId), id, body as UpdateFactDto)

  describe('#1916.19 — modifier le texte', () => {
    it('l’auteur réécrit son élément « moi » : le texte change, et le geste est journalisé avec son auteur', async () => {
      const { fact } = await edit(ALICE, rowOf(PERSONAL).id, { fact: 'Objectif : quatre signatures à Toulouse.' })
      expect(fact).toMatchObject({ fact: 'Objectif : quatre signatures à Toulouse.', ownedByMe: true })
      expect(store.events.rows).toEqual([
        expect.objectContaining({
          workspace_id: WORKSPACE,
          fact_id: fact.id,
          actor_user_id: ALICE,
          event: 'text_changed',
          previous_value: PERSONAL,
          new_value: 'Objectif : quatre signatures à Toulouse.',
        }),
      ])
    })

    it('NON — un membre simple ne réécrit pas l’élément PARTAGÉ d’un collègue : 403, rien ne bouge', async () => {
      await expect(edit(BOB, rowOf(SHARED).id, { fact: 'Freelance autorisé.' })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(rowOf(SHARED).fact).toBe(SHARED)
      expect(store.events.rows).toEqual([])
    })

    it('… son témoin : une manager réécrit la même ligne, et c’est ELLE que le journal nomme', async () => {
      await edit(CAROL, rowOf(SHARED).id, { fact: 'Nous ne proposons jamais de freelance en régie.' })
      expect(store.rows.map(row => row.fact)).toContain('Nous ne proposons jamais de freelance en régie.')
      expect(store.events.rows[0]).toMatchObject({ actor_user_id: CAROL, event: 'text_changed' })
    })

    it('NON — l’élément « moi » d’un collègue est hors d’atteinte, manager comprise : 404, rien ne bouge', async () => {
      for (const userId of [BOB, CAROL]) {
        await expect(edit(userId, rowOf(PERSONAL).id, { fact: 'réécrit' })).rejects.toBeInstanceOf(NotFoundException)
      }
      expect(rowOf(PERSONAL).fact).toBe(PERSONAL)
      expect(store.events.rows).toEqual([])
    })

    it('NON — un membre d’un AUTRE espace ne touche pas la ligne, même avec son identifiant : 404', async () => {
      await expect(edit(DAVE, rowOf(SHARED).id, { fact: 'réécrit' })).rejects.toBeInstanceOf(NotFoundException)
      expect(rowOf(SHARED).fact).toBe(SHARED)
    })

    it('un texte qui DOUBLE un autre élément de même portée est refusé (409) plutôt que de créer un doublon', async () => {
      await controller.pinFact(member(ALICE), { fact: 'Priorité à Lyon.', scope: 'user' } as PinFactDto)
      await expect(edit(ALICE, rowOf(PERSONAL).id, { fact: 'priorité à lyon' })).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(rowOf(PERSONAL).fact).toBe(PERSONAL)
    })

    it('un texte inchangé (au blanc près) n’écrit aucun geste dans l’historique', async () => {
      await edit(ALICE, rowOf(PERSONAL).id, { fact: `  ${PERSONAL}  ` })
      expect(store.events.rows).toEqual([])
    })

    it('le texte modifié est celui que Laura relit au tour suivant — une correction humaine gagne', async () => {
      await edit(ALICE, rowOf(SHARED).id, { fact: 'Nous proposons du freelance seulement en renfort.' })
      const ctx = await chatContext.build({ userId: BOB, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts.map(item => item.fact)).toEqual(['Nous proposons du freelance seulement en renfort.'])
    })

    it('si le journal ne peut pas s’écrire, la modification n’a pas lieu — jamais un geste sans trace', async () => {
      store.events.failNextSave = true
      await expect(edit(ALICE, rowOf(PERSONAL).id, { fact: 'réécrit sans trace' })).rejects.toThrow()
      expect(rowOf(PERSONAL).fact).toBe(PERSONAL)
    })
  })

  describe('#1916.22 — ajouter une échéance après coup', () => {
    it('l’auteur date son élément : l’échéance est posée et journalisée (aucune → la date)', async () => {
      const until = new Date(Date.now() + 30 * DAY).toISOString()
      const { fact } = await edit(ALICE, rowOf(PERSONAL).id, { expiresAt: until })
      expect(fact.expiresAt).toBe(until)
      expect(store.events.rows[0]).toMatchObject({ event: 'expiry_changed', previous_value: null, new_value: until })
    })

    it('une échéance PASSÉE est refusée (400) : on ne périme pas un élément d’un geste qui se dit « ajouter »', async () => {
      await expect(
        edit(ALICE, rowOf(PERSONAL).id, { expiresAt: new Date(Date.now() - DAY).toISOString() }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(rowOf(PERSONAL).expires_at).toBeNull()
    })

    it('retirer l’échéance (`null`) est journalisé (la date → aucune)', async () => {
      const until = new Date(Date.now() + 30 * DAY).toISOString()
      await edit(ALICE, rowOf(PERSONAL).id, { expiresAt: until })
      await edit(ALICE, rowOf(PERSONAL).id, { expiresAt: null })
      expect(rowOf(PERSONAL).expires_at).toBeNull()
      expect(store.events.rows[1]).toMatchObject({ event: 'expiry_changed', previous_value: until, new_value: null })
    })

    it('un élément ÉCHU redevient inconnu AVEC sa date : il reste à l’écran, marqué non utilisé, et ne part plus au modèle', async () => {
      rowOf(PERSONAL).expires_at = new Date(Date.now() - DAY)
      const ledger = await controller.readLedger(member(ALICE))
      expect(ledger.entries.find(entry => entry.text === PERSONAL)).toMatchObject({
        expiresAt: rowOf(PERSONAL).expires_at?.toISOString(),
        surfaces: [],
      })
      const ctx = await chatContext.build({ userId: ALICE, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts.map(item => item.fact)).not.toContain(PERSONAL)
      // L'outil `get_memory` de Laura lit le registre SANS la vue écran : l'élément échu n'y est pas.
      const forModel = await memory.readLedger({ userId: ALICE, workspaceId: WORKSPACE })
      expect(forModel.entries.map(entry => entry.text)).not.toContain(PERSONAL)
    })

    it('repousser l’échéance d’un élément échu le remet en service — à l’écran comme dans le contexte du modèle', async () => {
      rowOf(PERSONAL).expires_at = new Date(Date.now() - DAY)
      await edit(ALICE, rowOf(PERSONAL).id, { expiresAt: new Date(Date.now() + 10 * DAY).toISOString() })
      const ledger = await controller.readLedger(member(ALICE))
      expect(ledger.entries.find(entry => entry.text === PERSONAL)?.surfaces).toEqual(['chat', 'externalAssistant'])
      const ctx = await chatContext.build({ userId: ALICE, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts.map(item => item.fact)).toContain(PERSONAL)
    })
  })

  describe('#1916.21 — un changement de portée laisse une trace', () => {
    it('le propriétaire partage : le geste est journalisé ; redemander la même portée n’écrit rien', async () => {
      await controller.setFactScope(member(ALICE), rowOf(PERSONAL).id, { scope: 'workspace' })
      await controller.setFactScope(member(ALICE), rowOf(PERSONAL).id, { scope: 'workspace' })
      expect(store.events.rows).toEqual([
        expect.objectContaining({
          actor_user_id: ALICE,
          event: 'scope_changed',
          previous_value: 'user',
          new_value: 'workspace',
        }),
      ])
    })
  })

  describe('#1916.23 — voir l’historique', () => {
    it('raconte la création (texte d’origine, auteur) puis chaque geste, dans l’ordre, avec des prénoms', async () => {
      const id = rowOf(SHARED).id
      await edit(CAROL, id, { fact: 'Jamais de freelance, sauf renfort ponctuel.' })
      store.events.rows[0]!.created_at = new Date(Date.now() - 2 * DAY)
      const until = new Date(Date.now() + 30 * DAY).toISOString()
      await edit(ALICE, id, { expiresAt: until })

      const { entries } = await controller.factHistory(member(BOB), id)
      expect(
        entries.map(entry => [entry.event, entry.author?.firstName ?? null, entry.previousValue, entry.newValue]),
      ).toEqual([
        ['created', 'Alice', null, SHARED],
        ['text_changed', 'Carol', SHARED, 'Jamais de freelance, sauf renfort ponctuel.'],
        ['expiry_changed', 'Alice', null, until],
      ])
      expect(JSON.stringify(entries)).not.toMatch(/user-|@example\.com/)
    })

    it('NON — un collègue ne lit pas l’historique d’un élément « moi » (404) ; il lit celui du partagé (témoin)', async () => {
      await expect(controller.factHistory(member(BOB), rowOf(PERSONAL).id)).rejects.toBeInstanceOf(NotFoundException)
      await expect(controller.factHistory(member(CAROL), rowOf(PERSONAL).id)).rejects.toBeInstanceOf(NotFoundException)
      const { entries } = await controller.factHistory(member(BOB), rowOf(SHARED).id)
      expect(entries).toHaveLength(1)
    })

    it('NON — un autre espace ne lit aucun historique, même avec l’identifiant : 404', async () => {
      await expect(controller.factHistory(member(DAVE), rowOf(SHARED).id)).rejects.toBeInstanceOf(NotFoundException)
    })

    /**
     * #2439.10 (21/09/2026) — oublier ARCHIVE : l'historique n'est plus EMPORTÉ
     * par un `ON DELETE CASCADE`, il devient INATTEIGNABLE.
     *
     * Ce qui compte pour la personne est inchangé — « ce que j'ai oublié ne se
     * relit plus » — et c'est ce que ce test vérifie : `factHistory` répond 404,
     * comme sur un identifiant inconnu. Les lignes de journal restent en base
     * derrière la ligne archivée, ce qui est exactement la doctrine (« un fait
     * périmé redevient inconnu, il ne disparaît pas ») : les effacer pour de bon
     * ferait de l'archivage une demi-mesure qui détruit quand même l'histoire.
     */
    it('oublier un élément rend son historique INATTEIGNABLE (404), sans le détruire', async () => {
      const id = rowOf(PERSONAL).id
      await edit(ALICE, id, { fact: 'Texte avant l’oubli.' })
      await controller.unpinFact(member(ALICE), id)
      await expect(controller.factHistory(member(ALICE), id)).rejects.toBeInstanceOf(NotFoundException)
      expect(store.events.rows.map(event => event.fact_id)).toEqual([id])
    })

    /**
     * #1918.1 (masquage, 15/09/2026) — le même risque que `toWireFact` existe
     * dans l'HISTORIQUE : un collègue peut lire `previousValue`/`newValue`
     * d'un élément PARTAGÉ (`visibleFact` l'autorise, témoin ci-dessus). Un
     * secret collé par erreur puis corrigé resterait lisible dans l'« avant »
     * du geste `text_changed` si seul `toWireFact` masquait.
     */
    it('#1918.1 masquage — Bob lit l’historique d’un élément partagé MASQUÉ, Alice le lit ENTIER', async () => {
      const secretJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpc2lzYXNpZ25hdHVyZQ'
      const { fact } = await controller.pinFact(member(ALICE), {
        fact: 'Chaîne collée par erreur : postgres://user:hunter2@db.example.com/prod',
        scope: 'workspace',
      } as PinFactDto)
      await edit(ALICE, fact.id, { fact: `Jeton retrouvé : ${secretJwt}` })

      const bobHistory = await controller.factHistory(member(BOB), fact.id)
      const bobText = JSON.stringify(bobHistory)
      expect(bobText).not.toContain('hunter2')
      expect(bobText).not.toContain(secretJwt)
      expect(bobText).toContain('[valeur masquée]')

      const aliceHistory = await controller.factHistory(member(ALICE), fact.id)
      const aliceText = JSON.stringify(aliceHistory)
      expect(aliceText).toContain('hunter2')
      expect(aliceText).toContain(secretJwt)
    })
  })

  describe('#1916.13 / .16 / .18 / .24 — ce que l’écran lit sur chaque ligne', () => {
    it('nature, origine, auteur, droit de modifier et surfaces — calculés pour CHAQUE lecteur', async () => {
      const read = async (userId: string) =>
        (await controller.readLedger(member(userId))).entries.find(entry => entry.text === SHARED)
      expect(await read(ALICE)).toMatchObject({
        kind: 'correction',
        origin: 'manual',
        author: { firstName: 'Alice', avatarUrl: null },
        canEdit: true,
        surfaces: ['chat', 'externalAssistant'],
      })
      expect(await read(CAROL)).toMatchObject({ canEdit: true, author: { firstName: 'Alice' } })
      expect(await read(BOB)).toMatchObject({ canEdit: false, author: { firstName: 'Alice' } })
    })

    it('NON — l’auteur qui n’est plus membre de l’espace n’est pas nommé ; aucun identifiant ni adresse ne sort', async () => {
      store.rows.push({
        ...rowOf(SHARED),
        id: '00000000-0000-4000-8000-000000000999',
        user_id: ERIN,
        fact: 'Une règle posée par quelqu’un qui est parti.',
      })
      const ledger = await controller.readLedger(member(BOB))
      expect(ledger.entries.find(entry => entry.text.startsWith('Une règle posée'))).toMatchObject({ author: null })
      expect(JSON.stringify(ledger)).not.toMatch(/user-|@example\.com/)
    })

    it('NON — un membre d’une AUTRE ESN n’est jamais nommé, même rattaché à une ligne de cet espace', async () => {
      // Dave a un prénom et un profil — dans l'espace concurrent. Une ligne mal
      // rangée ne fait pas traverser son identité : la règle d'auteur partagée
      // (`common/workspace-authors.ts`) résout parmi les membres de l'espace LU.
      store.rows.push({
        ...rowOf(SHARED),
        id: '00000000-0000-4000-8000-000000000998',
        user_id: DAVE,
        fact: 'Une ligne rattachée à un membre d’une autre ESN.',
      })
      const ledger = await controller.readLedger(member(BOB))
      expect(ledger.entries.find(entry => entry.text.startsWith('Une ligne rattachée'))).toMatchObject({ author: null })
      // Le témoin : l'auteure de l'élément partagé, elle, est nommée.
      expect(ledger.entries.find(entry => entry.text === SHARED)).toMatchObject({ author: { firstName: 'Alice' } })
      expect(JSON.stringify(ledger)).not.toContain('Dave')
    })

    it('le registre servi à Laura (`get_memory`) ne porte PAS l’auteur : une identité n’entre dans aucun prompt', async () => {
      const forModel = await memory.readLedger({ userId: BOB, workspaceId: WORKSPACE })
      const shared = forModel.entries.find(entry => entry.text === SHARED)
      expect(shared).toBeDefined()
      expect(shared).not.toHaveProperty('author')
    })
  })

  /**
   * Q1 — décision de Louis du 13/09 : une « Note de Laura — à vérifier » dont une
   * PERSONNE réécrit le texte devient « Confirmée par <prénom> ». L'origine est
   * conservée ; Laura la range avec les faits déclarés. Changer seulement
   * l'échéance ne confirme rien : une date dit jusqu'à quand un contenu vaut, pas
   * qu'il est vrai.
   */
  describe('Q1 — une note de Laura confirmée par une personne', () => {
    const NOTE = 'ALTEN ne serait plus sur le compte.'

    beforeEach(async () => {
      await controller.pinFact(member(ALICE), { fact: NOTE, scope: 'workspace', origin: 'copilot' } as PinFactDto)
    })

    const noteRow = () => rowOf(NOTE)

    it('une réécriture du texte confirme la note : date, confirmateur, origine CONSERVÉE', async () => {
      const id = noteRow().id
      const { fact } = await edit(CAROL, id, { fact: 'ALTEN n’est plus sur le compte depuis juin.' })
      const row = store.rows.find(candidate => candidate.id === id)
      expect(row?.origin).toBe('copilot')
      expect(row?.confirmed_by).toBe(CAROL)
      expect(row?.confirmed_at).toBeInstanceOf(Date)
      expect(fact.confirmedAt).toEqual(row?.confirmed_at?.toISOString())
    })

    it('l’écran dit « confirmée par Carol » ; l’outil de Laura sait qu’elle l’est, sans nom', async () => {
      const id = noteRow().id
      await edit(CAROL, id, { fact: 'ALTEN n’est plus sur le compte depuis juin.' })

      const screenEntry = (await controller.readLedger(member(BOB))).entries.find(entry => entry.id === id)
      expect(screenEntry).toMatchObject({
        origin: 'copilot',
        detail: 'confirmedNote',
        confirmedBy: { firstName: 'Carol', avatarUrl: null },
      })

      const toolEntry = (await memory.readLedger({ userId: BOB, workspaceId: WORKSPACE })).entries.find(
        entry => entry.id === id,
      )
      expect(toolEntry).toMatchObject({ detail: 'confirmedNote' })
      expect(toolEntry).not.toHaveProperty('confirmedBy')
    })

    it('le contexte du modèle porte `confirmed: true` — le rang d’un fait déclaré se calcule côté IA', async () => {
      await edit(CAROL, noteRow().id, { fact: 'ALTEN n’est plus sur le compte depuis juin.' })
      const ctx = await chatContext.build({ userId: BOB, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts).toContainEqual({
        fact: 'ALTEN n’est plus sur le compte depuis juin.',
        kind: 'fact',
        origin: 'copilot',
        confirmed: true,
      })
    })

    it('changer SEULEMENT l’échéance ne confirme rien : la note reste « à vérifier », et voyage comme avant', async () => {
      const id = noteRow().id
      await edit(ALICE, id, { expiresAt: new Date(Date.now() + 20 * DAY).toISOString() })
      expect(store.rows.find(candidate => candidate.id === id)?.confirmed_at ?? null).toBeNull()
      const entry = (await controller.readLedger(member(ALICE))).entries.find(item => item.id === id)
      expect(entry).toMatchObject({ detail: 'copilotNote', confirmedBy: null })
      const ctx = await chatContext.build({ userId: ALICE, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts.find(item => item.fact === NOTE)).toEqual({ fact: NOTE, kind: 'fact', origin: 'copilot' })
    })

    it('le témoin : réécrire un fait DÉCLARÉ n’écrit aucune confirmation — elle ne concerne que les notes de Laura', async () => {
      await edit(ALICE, rowOf(PERSONAL).id, { fact: 'Objectif du trimestre : quatre signatures à Toulouse.' })
      const row = store.rows.find(candidate => candidate.fact.startsWith('Objectif du trimestre'))
      expect(row?.confirmed_at ?? null).toBeNull()
      expect(row?.confirmed_by ?? null).toBeNull()
    })

    it('le DERNIER à réécrire le texte est le confirmateur : le libellé répond du texte actuel', async () => {
      const id = noteRow().id
      await edit(ALICE, id, { fact: 'ALTEN a quitté le compte.' })
      await edit(CAROL, id, { fact: 'ALTEN a quitté le compte en juin.' })
      expect(store.rows.find(candidate => candidate.id === id)?.confirmed_by).toBe(CAROL)
    })

    it('NON — un membre simple ne confirme pas la note partagée d’un collègue : 403, elle reste à vérifier', async () => {
      const id = noteRow().id
      await expect(edit(BOB, id, { fact: 'Confirmé par Bob ?' })).rejects.toBeInstanceOf(ForbiddenException)
      expect(store.rows.find(candidate => candidate.id === id)?.confirmed_at ?? null).toBeNull()
    })

    it('un confirmateur qui n’est plus membre n’est pas nommé ; la note reste confirmée', async () => {
      const id = noteRow().id
      await edit(CAROL, id, { fact: 'ALTEN a quitté le compte en juin.' })
      const row = store.rows.find(candidate => candidate.id === id)
      if (row) row.confirmed_by = ERIN
      const entry = (await controller.readLedger(member(BOB))).entries.find(item => item.id === id)
      expect(entry).toMatchObject({ detail: 'confirmedNote', confirmedBy: null })
    })

    /**
     * #1962.19 / .20 / .22 — un GESTE DÉDIÉ confirme une note SANS en changer le
     * texte. Avant lui, la seule porte était de réécrire le texte (bloc Q1
     * ci-dessus) — une note qu'on veut confirmer TELLE QU'ELLE EST n'avait
     * aucun geste. La portée (#1962.20) reste le geste EXISTANT de
     * `MemoryFactRow.tsx` (#1916.21) — un réglage vit à un seul endroit.
     */
    it('#1962.19 — `confirm: true` seul confirme la note, sans toucher son texte', async () => {
      const id = noteRow().id
      const { fact } = await edit(CAROL, id, { confirm: true })
      expect(fact.fact).toBe(NOTE)
      const row = store.rows.find(candidate => candidate.id === id)
      expect(row?.origin).toBe('copilot')
      expect(row?.confirmed_by).toBe(CAROL)
      expect(row?.confirmed_at).toBeInstanceOf(Date)
      // #1962.22 — la date de confirmation voyage jusqu'à l'écran.
      expect(fact.confirmedAt).toEqual(row?.confirmed_at?.toISOString())
      const entry = (await controller.readLedger(member(BOB))).entries.find(item => item.id === id)
      expect(entry).toMatchObject({ detail: 'confirmedNote', confirmedAt: row?.confirmed_at?.toISOString() })
    })

    it('#1962.19 — confirmer une note déjà confirmée ne change ni son confirmateur ni sa date', async () => {
      const id = noteRow().id
      await edit(CAROL, id, { confirm: true })
      const firstConfirmedAt = store.rows.find(candidate => candidate.id === id)?.confirmed_at
      await edit(ALICE, id, { confirm: true })
      const row = store.rows.find(candidate => candidate.id === id)
      expect(row?.confirmed_by).toBe(CAROL)
      expect(row?.confirmed_at).toEqual(firstConfirmedAt)
    })

    it('#1962.19 — le témoin : `confirm: true` sur un fait DÉCLARÉ ne pose aucune confirmation', async () => {
      const { fact } = await edit(ALICE, rowOf(PERSONAL).id, { confirm: true })
      const row = store.rows.find(candidate => candidate.id === rowOf(PERSONAL).id)
      expect(row?.confirmed_at ?? null).toBeNull()
      expect(fact.confirmedAt ?? null).toBeNull()
    })

    it('#1962.19 — NON : un membre simple ne confirme pas la note partagée d’un collègue (403)', async () => {
      const id = noteRow().id
      await expect(edit(BOB, id, { confirm: true })).rejects.toBeInstanceOf(ForbiddenException)
      expect(store.rows.find(candidate => candidate.id === id)?.confirmed_at ?? null).toBeNull()
    })
  })
})
