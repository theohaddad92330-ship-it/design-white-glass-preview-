import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { defaultMemoryScope } from '@bellum/contracts'
import { success } from '@bellum/utils'
import { FindOperator, type Repository } from 'typeorm'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { createMockRepository } from '../../database/test-utils'
import type { AccountsService } from '../accounts/accounts.service'
import type { BusinessUnitService } from '../business-unit/business-unit.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { ChatContextService } from '../ia-proxy/chat-context.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ListFactsDto, PinFactDto } from './dto/memory.dto'
import { MemoryController } from './memory.controller'
import { MemoryService } from './memory.service'

/**
 * #1918.1 / #1918.6 — UN ÉLÉMENT « MOI UNIQUEMENT » N'ATTEINT JAMAIS UN AUTRE
 * MEMBRE, NI PAR L'API NI PAR LE CONTEXTE ENVOYÉ AU MODÈLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONSTAT QUI A PRODUIT CETTE GARDE (12/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `MemoryService.listFacts` ne filtrait que sur `workspace_id`. Cette lecture
 * est la SEULE de la table, et elle nourrit trois chemins : l'écran de mémoire
 * de chaque membre (`GET /memory/facts`, `GET /memory/ledger`), l'outil
 * `get_memory` de Laura (pont copilote → `readLedger`), et le contexte envoyé
 * au modèle quand n'importe quel membre parle à Laura
 * (`ChatContextService.loadMemory`). Tout élément épinglé était donc, par
 * construction, une règle de toute l'ESN.
 *
 * Le défaut n°1 du dépôt est la lecture plus large que l'écriture : ajouter une
 * portée à l'écriture ne protège rien si une seule lecture l'ignore.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne vérifie pas qu'un argument est passé : un argument ne dit pas ce
 * qu'une requête filtre. Elle rejoue le scénario à DEUX membres du même espace
 * contre un dépôt en mémoire qui APPLIQUE réellement chaque clause de son query
 * builder — et qui REFUSE une clause qu'il ne sait pas simuler, plutôt que de
 * l'ignorer (une clause ignorée rendrait tout, et l'isolation passerait pour un
 * hasard heureux). Le service, le contrôleur et le service de contexte sont les
 * VRAIS ; seules les tables sont simulées.
 *
 * Retirer le prédicat de portée de `listFacts` fait tomber les tests « Bob ne
 * voit pas… » sur les DEUX chemins (API et contexte du modèle).
 *
 * Qu'elle LIT quelque chose : Alice retrouve ses trois éléments (sans compte
 * actif, la lecture rend aussi ceux bornés à un compte), et Bob retrouve
 * l'élément PARTAGÉ (le témoin). Un dépôt qui ne rendrait plus rien rendrait
 * l'isolation vraie par vacuité — ces tests-là tomberaient.
 *
 * Sait dire NON — vérifié le 13/09/2026 : prédicat de portée retiré de
 * `listFacts`, 6 tests sur 13 tombent (écran `facts`, `ledger`, contexte du
 * modèle avec et sans compte, partage après changement de portée).
 */

type Row = MemoryPinnedFactEntity

const ALICE = 'user-alice'
const BOB = 'user-bob'
/** #1918.7 — une manager de l'espace (rôle `admin`). Alice et Bob sont `member`. */
const CAROL = 'user-carol'
const ROLE_OF: Record<string, string> = { [CAROL]: 'admin' }
const WORKSPACE = 'ws-esn'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'

const PERSONAL = 'Mon objectif du trimestre : trois signatures à Toulouse.'
const SHARED = 'Nous ne proposons jamais de freelance.'
const PERSONAL_ON_ACCOUNT = 'Je vise un premier rendez-vous avec la DSI avant octobre.'

/**
 * Une clause du query builder, appliquée à une ligne. Les colonnes s'écrivent
 * `f.x` dans une lecture et `x` dans une suppression : l'alias est retiré avant
 * de comparer. Toute clause inconnue LÈVE.
 */
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

class FakeFactQueryBuilder {
  private readonly clauses: string[] = []
  private readonly params: Record<string, unknown> = {}
  private deleting = false
  private updating = false
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
    this.deleting = true
    return this
  }

  // #2439.10 — « oublier » ARCHIVE : l'écriture de `unpinFact` est un UPDATE.
  update(): this {
    this.updating = true
    return this
  }

  set(patch: Partial<Row>): this {
    this.patch = patch
    return this
  }

  private matching(): Row[] {
    if (this.clauses.length === 0) throw new Error('requête sans where — lecture non bornée')
    return this.store.rows.filter(row => this.clauses.every(clause => applies(clause, row, this.params)))
  }

  async getMany(): Promise<Row[]> {
    if (this.deleting || this.updating) throw new Error('getMany sur une écriture')
    return this.matching().sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
  }

  async getOne(): Promise<Row | null> {
    if (this.deleting || this.updating) throw new Error('getOne sur une écriture')
    return this.matching()[0] ?? null
  }

  async execute(): Promise<{ affected: number; raw: [] }> {
    if (this.updating) {
      const touched = this.matching()
      for (const row of touched) Object.assign(row, this.patch)
      return { affected: touched.length, raw: [] }
    }
    if (!this.deleting) throw new Error('execute hors écriture : non simulé')
    const hit = new Set(this.matching())
    const before = this.store.rows.length
    this.store.rows.splice(0, this.store.rows.length, ...this.store.rows.filter(row => !hit.has(row)))
    return { affected: before - this.store.rows.length, raw: [] }
  }
}

/** Dépôt simulé qui HONORE ses `where` — la base, pas un bouchon qui rend tout. */
class FakeFactStore {
  readonly rows: Row[] = []
  private sequence = 1

  /**
   * #1916.23 — un changement de portée et son geste journalisé passent par une
   * transaction ; les auteurs de l'écran, par une requête brute (aucun membre
   * simulé ici : cette garde porte sur la portée, pas sur les prénoms).
   */
  readonly manager = {
    transaction: async <T>(work: (em: { withRepository: <R>(repo: R) => R }) => Promise<T>): Promise<T> =>
      work({ withRepository: repo => repo }),
    query: async (): Promise<unknown[]> => [],
  }

  createQueryBuilder(): FakeFactQueryBuilder {
    return new FakeFactQueryBuilder(this)
  }

  create(partial: Partial<Row>): Row {
    return { ...partial } as Row
  }

  async save(row: Row): Promise<Row> {
    const stored = {
      ...row,
      id: row.id ?? `00000000-0000-4000-8000-${String(this.sequence++).padStart(12, '0')}`,
      // Les défauts de la BASE (migrations `1788241633084`, `1792800070000`) :
      // une écriture qui omettrait la portée recevrait `workspace`, comme en vrai.
      kind: row.kind ?? 'fact',
      origin: row.origin ?? 'manual',
      scope: row.scope ?? 'workspace',
      expires_at: row.expires_at ?? null,
      created_at: row.created_at ?? new Date(Date.now() + this.sequence),
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

  /** #1918.5 — la suppression par critère de `forgetConversation`, bornée comme en vrai. */
  async delete(where: Record<string, unknown>): Promise<{ affected: number }> {
    const hit = new Set(this.rows.filter(row => this.equals(row, where)))
    const before = this.rows.length
    this.rows.splice(0, this.rows.length, ...this.rows.filter(row => !hit.has(row)))
    return { affected: before - this.rows.length }
  }
}

function member(userId: string): CurrentUserPayload {
  return { userId, email: `${userId}@example.com` } as CurrentUserPayload
}

/**
 * #1918.2 — les périmètres que CHAQUE personne porte, par `business_unit_members`.
 * `wire` les injecte tels quels : le test décide qui est de quelle équipe.
 */
type Perimeters = Record<string, string[]>

function wire(store: FakeFactStore, perimeters: Perimeters = {}) {
  const memory = new MemoryService(
    store as never,
    createMockRepository() as never,
    // Aucun résumé de conversation : ce test porte sur les faits épinglés.
    Object.assign(createMockRepository(), {
      findOne: jest.fn().mockResolvedValue(null),
      // #1918.5 — `forgetConversation` compte AVANT d'effacer.
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    }) as never,
    createMockRepository() as never,
    createMockRepository() as never,
    {
      resolveProfileData: jest.fn().mockResolvedValue({}),
      resolveContext: jest.fn().mockResolvedValue({ canonicalRow: null, ownRow: null }),
    } as never,
    // #1916.23 — le journal des gestes : cette garde n'en lit rien, elle le laisse écrire.
    { create: (row: object) => row, save: async (row: object) => row, find: async () => [] } as never,
  )
  // Le rôle vient de la VRAIE résolution d'espace du dépôt
  // (`WorkspaceContextService.resolveActiveWorkspace`) — simulée ici par personne.
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async (userId: string) => ({
      workspaceId: WORKSPACE,
      role: ROLE_OF[userId] ?? 'member',
    })),
  } as unknown as WorkspaceContextService
  // #1918.2 — le VRAI service n'est pas simulé : seule sa lecture
  // d'appartenance l'est, et elle est bornée à (espace, personne) comme en vrai.
  const businessUnits = {
    perimetersOf: jest.fn(async (workspaceId: string, userId: string) =>
      workspaceId === WORKSPACE ? (perimeters[userId] ?? []) : [],
    ),
  } as unknown as BusinessUnitService
  const controller = new MemoryController(memory, workspaceContext, undefined, businessUnits)

  const accounts = {
    findOne: jest.fn().mockResolvedValue(success({ id: ACCOUNT, company_name: 'ACME', raw_analysis: null })),
    listAccountsDigest: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    listCopilotAccountFacts: jest.fn().mockResolvedValue(new Map()),
    // #3892.1 — cette garde porte sur la PORTÉE, pas sur les noms de compte :
    // aucun des faits qu'elle épingle ne porte d'`accountId` autre que
    // `ACCOUNT` lui-même, donc jamais appelée en pratique, mais sa PRÉSENCE
    // doit tenir — un service réel dont la dépendance manque échouerait
    // fermé (`loadMemory` rend alors une mémoire VIDE), ce qui ferait
    // rougir ces tests pour la mauvaise raison.
    namesForAccounts: jest.fn().mockResolvedValue(new Map()),
  } as unknown as AccountsService
  const contacts = { findByAccount: jest.fn().mockResolvedValue([]) } as unknown as ContactsService
  const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) } as unknown as EsnProfileReader
  const crmConnections = {
    findOne: jest.fn().mockResolvedValue(null),
    manager: { query: jest.fn().mockResolvedValue([]) },
  } as unknown as Repository<CrmConnectionEntity>
  // Le VRAI service de contexte : c'est lui qui construit ce que le modèle lit.
  const chatContext = new ChatContextService(accounts, contacts, esnProfile, memory, crmConnections)

  return { memory, controller, chatContext, businessUnits }
}

describe('#1918.1 — la portée « moi uniquement » entre deux membres du même espace', () => {
  let store: FakeFactStore
  let controller: MemoryController
  let chatContext: ChatContextService
  let memory: MemoryService

  beforeEach(async () => {
    store = new FakeFactStore()
    ;({ controller, chatContext, memory } = wire(store))
    // Les écritures passent par la VRAIE porte : la portée vient du corps, le
    // propriétaire du jeton.
    await controller.pinFact(member(ALICE), { fact: PERSONAL, scope: 'user' } as PinFactDto)
    await controller.pinFact(member(ALICE), { fact: SHARED, scope: 'workspace' } as PinFactDto)
    await controller.pinFact(member(ALICE), {
      fact: PERSONAL_ON_ACCOUNT,
      accountId: ACCOUNT,
      scope: 'user',
    } as PinFactDto)
  })

  function rowOf(text: string): Row {
    const row = store.rows.find(candidate => candidate.fact === text)
    if (!row) throw new Error(`aucune ligne pour « ${text} »`)
    return row
  }

  it('écrit la portée demandée, et le propriétaire est celui du JETON — jamais un champ du corps', async () => {
    await controller.pinFact(member(ALICE), {
      fact: 'Une ligne qui prétend appartenir à Bob',
      scope: 'user',
      userId: BOB,
    } as unknown as PinFactDto)
    expect(rowOf(PERSONAL)).toMatchObject({ user_id: ALICE, scope: 'user' })
    expect(rowOf(SHARED)).toMatchObject({ user_id: ALICE, scope: 'workspace' })
    expect(rowOf('Une ligne qui prétend appartenir à Bob').user_id).toBe(ALICE)
  })

  it('lit un corpus non vide — Alice retrouve SES éléments, par l’API ET dans le contexte du modèle', async () => {
    // Sans compte actif, la lecture rend aussi les éléments bornés à un compte
    // (comportement d'avant ce lot, inchangé) : Alice en retrouve donc TROIS.
    const { facts } = await controller.listFacts(member(ALICE), {})
    expect(facts.map(fact => fact.fact).sort()).toEqual([PERSONAL, SHARED, PERSONAL_ON_ACCOUNT].sort())
    expect(facts.find(fact => fact.fact === PERSONAL)).toMatchObject({ scope: 'user', ownedByMe: true })

    const ctx = await chatContext.build({ userId: ALICE, workspaceId: WORKSPACE })
    expect(ctx.pinnedFacts.map(fact => fact.fact).sort()).toEqual([PERSONAL, SHARED, PERSONAL_ON_ACCOUNT].sort())
  })

  describe('chemin API — ce que Bob lit à l’écran', () => {
    it('GET /memory/facts : Bob voit l’élément PARTAGÉ (témoin), jamais l’élément « moi » d’Alice', async () => {
      const { facts } = await controller.listFacts(member(BOB), {})
      expect(facts.map(fact => fact.fact)).toEqual([SHARED])
      expect(facts[0]).toMatchObject({ scope: 'workspace', ownedByMe: false })
    })

    it('GET /memory/facts sur un compte : l’élément « moi » d’Alice sur CE compte ne sort pas non plus', async () => {
      const { facts } = await controller.listFacts(member(BOB), { accountId: ACCOUNT })
      expect(facts.map(fact => fact.fact)).toEqual([SHARED])

      const own = await controller.listFacts(member(ALICE), { accountId: ACCOUNT })
      expect(own.facts.map(fact => fact.fact).sort()).toEqual([PERSONAL, SHARED, PERSONAL_ON_ACCOUNT].sort())
    })

    it('GET /memory/ledger (l’écran ET l’outil `get_memory` de Laura) : même borne', async () => {
      const bobLedger = await controller.readLedger(member(BOB))
      const bobFacts = bobLedger.entries.filter(entry => entry.layer === 'facts')
      expect(bobFacts.map(entry => entry.text)).toEqual([SHARED])
      expect(bobFacts[0]).toMatchObject({ scope: 'workspace', ownedByMe: false })

      const aliceLedger = await controller.readLedger(member(ALICE))
      const personal = aliceLedger.entries.find(entry => entry.text === PERSONAL)
      expect(personal).toMatchObject({ layer: 'facts', scope: 'user', ownedByMe: true })
    })
  })

  describe('chemin MODÈLE — ce qui part au prompt quand Bob parle à Laura', () => {
    it('sans compte actif : le partagé part (témoin), l’élément « moi » d’Alice ne part pas', async () => {
      const ctx = await chatContext.build({ userId: BOB, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts.map(fact => fact.fact)).toEqual([SHARED])
    })

    it('sur le compte où Alice a une note personnelle : elle ne part pas non plus', async () => {
      const ctx = await chatContext.build({ userId: BOB, workspaceId: WORKSPACE, accountId: ACCOUNT })
      expect(ctx.pinnedFacts.map(fact => fact.fact)).toEqual([SHARED])
      expect(JSON.stringify(ctx)).not.toContain('Toulouse')
      expect(JSON.stringify(ctx)).not.toContain('DSI avant octobre')
    })
  })

  describe('les écritures qui visent une ligne existante', () => {
    it('Bob ne peut PAS supprimer l’élément « moi » d’Alice, même avec son identifiant — 404, et la ligne reste', async () => {
      const target = rowOf(PERSONAL)
      await expect(controller.unpinFact(member(BOB), target.id)).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        memory.forgetLedgerEntry({ userId: BOB, workspaceId: WORKSPACE, layer: 'facts', id: target.id }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(store.rows).toContain(target)
    })

    /**
     * #1918.7 — décision de Louis du 13/09/2026 : un élément PARTAGÉ avec l'ESN
     * ne se retire que par son AUTEUR ou un MANAGER (rôles `owner` / `admin` de
     * l'espace). Avant, n'importe quel membre retirait la règle d'un collègue.
     * La portée privée gagne sur le rôle : un manager ne touche pas à l'élément
     * « moi » d'un collègue — il ne sait même pas qu'il existe (404).
     */
    describe('#1918.7 — qui retire un élément PARTAGÉ', () => {
      it('un membre simple sur l’élément partagé d’un collègue : 403, et la ligne reste — par les DEUX portes', async () => {
        const target = rowOf(SHARED)
        await expect(controller.unpinFact(member(BOB), target.id)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
          controller.forgetLedgerEntry(member(BOB), { layer: 'facts', id: target.id }),
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(store.rows).toContain(target)
      })

      /**
       * #2439.10 (21/09/2026) — « retirer » ARCHIVE : la ligne RESTE en base et
       * porte `archived_at`. Ce qui se vérifie ici est donc « l'élément n'est
       * plus VISIBLE », et non « la ligne a disparu » — la promesse de portée est
       * intacte, la promesse de destruction n'a jamais été la bonne (doctrine
       * « on archive, on ne supprime pas »). La non-destruction et la
       * non-réapparition ont leur propre garde : `memory-forget-archives.spec.ts`.
       */
      async function visibleTexts(userId: string): Promise<string[]> {
        const facts = await memory.listFacts({ workspaceId: WORKSPACE, userId })
        return facts.map(fact => fact.fact)
      }

      it('une manager retire l’élément partagé d’un collègue', async () => {
        await controller.unpinFact(member(CAROL), rowOf(SHARED).id)
        expect(await visibleTexts(CAROL)).not.toContain(SHARED)
        expect(store.rows.map(row => row.fact)).toContain(SHARED)
      })

      it('… y compris depuis Réglages › Mémoire', async () => {
        await controller.forgetLedgerEntry(member(CAROL), { layer: 'facts', id: rowOf(SHARED).id })
        expect(await visibleTexts(CAROL)).not.toContain(SHARED)
      })

      it('l’auteur retire son propre élément partagé', async () => {
        await controller.unpinFact(member(ALICE), rowOf(SHARED).id)
        expect(await visibleTexts(ALICE)).not.toContain(SHARED)
      })

      it('une manager sur l’élément « moi » d’un collègue : toujours 404 — la portée privée gagne sur le rôle', async () => {
        const target = rowOf(PERSONAL)
        await expect(controller.unpinFact(member(CAROL), target.id)).rejects.toBeInstanceOf(NotFoundException)
        await expect(
          controller.forgetLedgerEntry(member(CAROL), { layer: 'facts', id: target.id }),
        ).rejects.toBeInstanceOf(NotFoundException)
        expect(store.rows).toContain(target)
      })

      it('un identifiant inexistant reste un 404, pas un 403 — le refus ne se prononce que sur une ligne visible', async () => {
        await expect(controller.unpinFact(member(BOB), '00000000-0000-4000-8000-999999999999')).rejects.toBeInstanceOf(
          NotFoundException,
        )
      })

      it('la liste dit à CHACUN s’il peut retirer : l’auteur et la manager oui, le membre simple non', async () => {
        const canForget = async (userId: string) =>
          (await controller.listFacts(member(userId), {})).facts.find(fact => fact.fact === SHARED)?.canForget
        expect(await canForget(ALICE)).toBe(true)
        expect(await canForget(CAROL)).toBe(true)
        expect(await canForget(BOB)).toBe(false)

        const bobLedger = await controller.readLedger(member(BOB))
        expect(bobLedger.entries.find(entry => entry.text === SHARED)).toMatchObject({ canForget: false })
        const carolLedger = await controller.readLedger(member(CAROL))
        expect(carolLedger.entries.find(entry => entry.text === SHARED)).toMatchObject({ canForget: true })
      })
    })

    it('Bob qui épingle le MÊME texte que l’élément « moi » d’Alice obtient SA ligne — jamais celle d’Alice', async () => {
      const { fact } = await controller.pinFact(member(BOB), { fact: PERSONAL, scope: 'user' } as PinFactDto)
      expect(fact.id).not.toBe(rowOf(PERSONAL).id)
      expect(fact.ownedByMe).toBe(true)
      expect(
        store.rows
          .filter(row => row.fact === PERSONAL)
          .map(row => row.user_id)
          .sort(),
      ).toEqual([ALICE, BOB])
    })

    it('seul le PROPRIÉTAIRE change la portée : Bob reçoit un 404 et rien ne bouge', async () => {
      await expect(controller.setFactScope(member(BOB), rowOf(SHARED).id, { scope: 'user' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
      expect(rowOf(SHARED).scope).toBe('workspace')
    })

    it('Alice partage son élément « moi » : dès lors Bob le lit, à l’écran comme dans le contexte', async () => {
      const { fact } = await controller.setFactScope(member(ALICE), rowOf(PERSONAL).id, { scope: 'workspace' })
      expect(fact).toMatchObject({ scope: 'workspace', ownedByMe: true })

      const { facts } = await controller.listFacts(member(BOB), {})
      // Le partagé devient lisible ; la note d'Alice sur le compte, restée « moi », non.
      expect(facts.map(item => item.fact).sort()).toEqual([PERSONAL, SHARED].sort())
      const ctx = await chatContext.build({ userId: BOB, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts.map(item => item.fact)).toContain(PERSONAL)
    })
  })

  /**
   * #1918.8 — « Je préfère prospecter par téléphone » est une préférence
   * PERSONNELLE (le retour #1918, mot pour mot). Les trois écrans qui épinglent
   * proposent la portée de `defaultMemoryScope` ; vérifié à l'intégration du
   * 13/09 (mémoire lisible × trace par réponse) : une « Préférence » épinglée
   * avec ce défaut n'atteint un collègue ni par l'API, ni par le registre (et
   * donc l'outil `get_memory`), ni par le contexte envoyé au modèle.
   */
  describe('#1918.8 — une « Préférence » épinglée avec la portée proposée par défaut', () => {
    const PREFERENCE = 'Je préfère prospecter par téléphone.'

    beforeEach(async () => {
      await controller.pinFact(member(ALICE), {
        fact: PREFERENCE,
        kind: 'preference',
        scope: defaultMemoryScope({ kind: 'preference', accountId: null }),
      } as PinFactDto)
    })

    it('le défaut proposé est « Toi uniquement », avec ou sans compte — et la ligne est écrite ainsi', () => {
      expect(defaultMemoryScope({ kind: 'preference', accountId: null })).toBe('user')
      expect(defaultMemoryScope({ kind: 'preference', accountId: ACCOUNT })).toBe('user')
      expect(rowOf(PREFERENCE)).toMatchObject({ user_id: ALICE, kind: 'preference', scope: 'user' })
    })

    it('Alice la retrouve à l’écran et dans son contexte — la lecture n’est pas vide', async () => {
      const { facts } = await controller.listFacts(member(ALICE), {})
      expect(facts.find(fact => fact.fact === PREFERENCE)).toMatchObject({ scope: 'user', ownedByMe: true })
      const ctx = await chatContext.build({ userId: ALICE, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts.map(fact => fact.fact)).toContain(PREFERENCE)
    })

    it('NON — Bob ne la reçoit ni par GET /memory/facts, ni par le registre, ni dans le contexte du modèle', async () => {
      const { facts } = await controller.listFacts(member(BOB), {})
      expect(facts.map(fact => fact.fact)).toEqual([SHARED])

      const ledger = await controller.readLedger(member(BOB))
      expect(ledger.entries.map(entry => entry.text)).not.toContain(PREFERENCE)

      const ctx = await chatContext.build({ userId: BOB, workspaceId: WORKSPACE })
      expect(ctx.pinnedFacts.map(fact => fact.fact)).toEqual([SHARED])
      expect(JSON.stringify(ctx)).not.toContain('téléphone')
      expect(ctx.pinnedFactIds).not.toContain(rowOf(PREFERENCE).id)
    })
  })

  it('un onglet d’AVANT le déploiement (corps sans portée) épingle ce que son écran lui promet : un élément partagé', async () => {
    await controller.pinFact(member(ALICE), { fact: 'Onglet resté ouvert' } as PinFactDto)
    expect(rowOf('Onglet resté ouvert').scope).toBe('workspace')
  })

  /**
   * #1918.8 — décision du 13/09 : le serveur applique à une « Préférence » le
   * MÊME défaut que les écrans. Un onglet ouvert avant le déploiement n'envoie
   * pas de portée ; il ne doit jamais partager par accident ce que l'écran
   * aurait gardé privé. Les autres natures gardent le défaut historique (test
   * ci-dessus, et le témoin d'une correction ci-dessous).
   */
  describe('#1918.8 — une « Préférence » envoyée SANS portée', () => {
    const LEGACY_PREFERENCE = 'Je préfère les rendez-vous le matin.'

    beforeEach(async () => {
      await controller.pinFact(member(ALICE), { fact: LEGACY_PREFERENCE, kind: 'preference' } as PinFactDto)
    })

    it('est écrite « Toi uniquement », au nom du jeton', () => {
      expect(rowOf(LEGACY_PREFERENCE)).toMatchObject({ user_id: ALICE, kind: 'preference', scope: 'user' })
    })

    it('NON — Bob ne la reçoit ni par l’API, ni par le registre, ni dans le contexte du modèle', async () => {
      const { facts } = await controller.listFacts(member(BOB), {})
      expect(facts.map(fact => fact.fact)).toEqual([SHARED])
      const ledger = await controller.readLedger(member(BOB))
      expect(ledger.entries.map(entry => entry.text)).not.toContain(LEGACY_PREFERENCE)
      const ctx = await chatContext.build({ userId: BOB, workspaceId: WORKSPACE })
      expect(JSON.stringify(ctx)).not.toContain('rendez-vous le matin')

      // Alice, elle, la retrouve : la lecture n'est pas vide.
      const own = await chatContext.build({ userId: ALICE, workspaceId: WORKSPACE })
      expect(own.pinnedFacts.map(fact => fact.fact)).toContain(LEGACY_PREFERENCE)
    })

    it('témoin — une correction sans portée garde le défaut historique : partagée', async () => {
      await controller.pinFact(member(ALICE), {
        fact: 'Le décideur est Julie Martin.',
        kind: 'correction',
      } as PinFactDto)
      expect(rowOf('Le décideur est Julie Martin.').scope).toBe('workspace')
    })
  })

  /**
   * #1918.1 (masquage) — décision de Louis du 15/09/2026, déclenchée par un
   * fait mesuré en production (`ed7caa6ee`) : le registre de mémoire rend le
   * texte de l'utilisateur TEL QUEL. Pour l'auteur c'est normal. Mais une
   * mémoire `workspace` est lisible par TOUS les membres de l'ESN — ce qu'un
   * membre y colle par erreur (une chaîne de connexion, un jeton) devient
   * lisible par les autres. Règle : `scope === 'workspace' && !ownedByMe`.
   *
   * Sait dire NON — vérifié à la main le 15/09/2026 : `toWireFact` rendu à
   * `fact: row.fact` inconditionnel fait tomber le premier test ci-dessous ;
   * la condition inversée (`ownedByMe` au lieu de `!ownedByMe`) fait tomber le
   * second (Alice ne lirait plus SON propre texte).
   */
  describe('masquage (#1918.1, 15/09/2026) — une mémoire « workspace » qui contient un secret', () => {
    const SECRET_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpc2lzYXNpZ25hdHVyZQ'
    const SECRET_FACT = `Chaîne collée par erreur : postgres://user:hunter2@db.example.com/prod, jeton ${SECRET_JWT}`

    beforeEach(async () => {
      await controller.pinFact(member(ALICE), { fact: SECRET_FACT, scope: 'workspace' } as PinFactDto)
    })

    it('Bob (non-auteur) le lit MASQUÉ — écran, registre ET contexte du modèle envoyé à Laura', async () => {
      const { facts } = await controller.listFacts(member(BOB), {})
      const bobFact = facts.find(fact => fact.fact.includes('Chaîne collée'))
      expect(bobFact?.fact).not.toContain('hunter2')
      expect(bobFact?.fact).not.toContain(SECRET_JWT)
      expect(bobFact?.fact).toContain('[valeur masquée]')

      const ledger = await controller.readLedger(member(BOB))
      const bobEntry = ledger.entries.find(entry => entry.text.includes('Chaîne collée'))
      expect(bobEntry?.text).not.toContain('hunter2')
      expect(bobEntry?.text).toContain('[valeur masquée]')

      const ctx = await chatContext.build({ userId: BOB, workspaceId: WORKSPACE })
      expect(JSON.stringify(ctx)).not.toContain('hunter2')
      expect(JSON.stringify(ctx)).not.toContain(SECRET_JWT)
    })

    it('Alice (l’auteure) le lit ENTIER — masquer son propre texte serait une régression', async () => {
      const { facts } = await controller.listFacts(member(ALICE), {})
      const aliceFact = facts.find(fact => fact.fact.includes('Chaîne collée'))
      expect(aliceFact?.fact).toBe(SECRET_FACT)

      const ctx = await chatContext.build({ userId: ALICE, workspaceId: WORKSPACE })
      expect(JSON.stringify(ctx)).toContain('hunter2')
    })

    it('témoin de sur-masquage — la prose ordinaire partagée (SHARED) reste intacte pour Bob', async () => {
      const { facts } = await controller.listFacts(member(BOB), {})
      expect(facts.map(fact => fact.fact)).toContain(SHARED)
    })
  })
})

/**
 * #1918.2 — « MON ÉQUIPE / MA BU » : UNE PORTÉE QUI DÉSIGNE UN OBJET À MEMBRES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE REFUSE, ET POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le registre disait « ABSENT — aucune notion de team/BU dans les tables de
 * mémoire », et la seule source d’un tel libellé était une réponse de
 * QUESTIONNAIRE. Une portée branchée sur un libellé déclaratif ne filtre rien :
 * elle promet une équipe et livre l’ESN entière. Cette suite mesure la promesse
 * sur l’APPARTENANCE — un membre du périmètre lit, un non-membre ne lit pas —
 * et le refus d’écrire pour une équipe dont on n’est pas.
 *
 * ⚠️ Le témoin qui compte : les deux portées d’avant se comportent à
 * l’identique. Une valeur ajoutée qui change le comportement des anciennes est
 * la régression la plus probable de ce lot.
 *
 * Sait dire NON : la borne d’appartenance retirée de `visibleToViewer`, « qui ne
 * PORTE pas le périmètre ne la lit pas » tombe ; la vérification retirée de
 * `pinFact`, « on n’épingle PAS pour une équipe dont on n’est pas » tombe.
 */
describe('#1918.2 — la portée « mon périmètre » s’appuie sur l’appartenance, jamais sur un libellé', () => {
  const LYON = '22222222-2222-4222-8222-222222222222'
  const NANTES = '33333333-3333-4333-8333-333333333333'
  const TEAM_RULE = 'À Lyon on ne descend pas sous 480 € par jour.'
  const FOREIGN_RULE = 'Une règle pour Nantes, écrite depuis Lyon'

  let store: FakeFactStore
  let controller: MemoryController

  beforeEach(async () => {
    store = new FakeFactStore()
    // Alice ET Bob portent Lyon ; Carol ne porte rien — et elle est manager de
    // l’espace, ce qui ne la fait entrer dans aucune équipe.
    ;({ controller } = wire(store, { [ALICE]: [LYON], [BOB]: [LYON] }))
    await controller.pinFact(member(ALICE), {
      fact: TEAM_RULE,
      scope: 'business_unit',
      businessUnitId: LYON,
    } as PinFactDto)
    await controller.pinFact(member(ALICE), { fact: SHARED, scope: 'workspace' } as PinFactDto)
    await controller.pinFact(member(ALICE), { fact: PERSONAL, scope: 'user' } as PinFactDto)
  })

  it('écrit la portée ET le périmètre DÉSIGNÉ — la ligne dit de quelle équipe elle est', () => {
    const row = store.rows.find(candidate => candidate.fact === TEAM_RULE)
    expect(row).toMatchObject({ scope: 'business_unit', business_unit_id: LYON, user_id: ALICE })
  })

  it('un MEMBRE du périmètre la lit — corpus non vide, l’isolation n’est pas vraie par vacuité', async () => {
    const { facts } = await controller.listFacts(member(BOB), {})
    expect(facts.map(fact => fact.fact)).toContain(TEAM_RULE)
    const ledger = await controller.readLedger(member(BOB))
    expect(ledger.entries.map(entry => entry.text).join(' ')).toContain(TEAM_RULE)
  })

  it('qui ne PORTE pas le périmètre ne la lit pas — ni par l’API, ni au registre, même manager', async () => {
    const { facts } = await controller.listFacts(member(CAROL), {})
    expect(facts.map(fact => fact.fact)).not.toContain(TEAM_RULE)
    const ledger = await controller.readLedger(member(CAROL))
    expect(ledger.entries.map(entry => entry.text).join(' ')).not.toContain(TEAM_RULE)
  })

  it('on n’épingle PAS pour une équipe dont on n’est pas — le corps désigne, l’appartenance autorise', async () => {
    await expect(
      controller.pinFact(member(ALICE), {
        fact: FOREIGN_RULE,
        scope: 'business_unit',
        businessUnitId: NANTES,
      } as PinFactDto),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(store.rows.map(row => row.fact)).not.toContain(FOREIGN_RULE)
  })

  it('TÉMOIN — les deux portées d’avant se comportent EXACTEMENT comme avant', async () => {
    const carol = await controller.listFacts(member(CAROL), {})
    // Le partagé, toujours lu de tous ; le « moi » d’Alice, de personne d’autre.
    expect(carol.facts.map(fact => fact.fact)).toContain(SHARED)
    expect(carol.facts.map(fact => fact.fact)).not.toContain(PERSONAL)
    const alice = await controller.listFacts(member(ALICE), {})
    expect(alice.facts.map(fact => fact.fact)).toEqual(expect.arrayContaining([SHARED, PERSONAL, TEAM_RULE]))
  })
})

/**
 * #1918.5 — « UNE CONVERSATION TEMPORAIRE » : LA MÉMOIRE QUI NE SURVIT PAS AU FIL.
 *
 * La sémantique n’est pas inventée ici : c’est celle du document « fil seul »
 * (#1954, décision de Louis du 12/09/2026 — « conservé tant que le fil existe,
 * supprimé avec lui, jamais listé dans Connaissances »). Cette suite mesure les
 * trois moitiés : lue dans SON fil, invisible partout ailleurs, emportée par la
 * suppression du fil — au MÊME endroit que l’oubli du résumé roulant.
 *
 * Sait dire NON : la branche de fil retirée de `visibleToViewer`, « son auteur
 * la lit DANS son fil » tombe ; la borne `conversation_id` retirée, « elle ne
 * sort NI dans un autre fil » tombe ; la suppression retirée de
 * `forgetConversation`, « le fil supprimé l’emporte » tombe.
 */
describe('#1918.5 — la portée « cette conversation » ne sort pas de son fil', () => {
  const THREAD = 'fil-appel-offre'
  const OTHER_THREAD = 'fil-autre'
  const TEMPORARY = 'Pour cet échange : on raisonne en TJM, pas en forfait.'

  let store: FakeFactStore
  let controller: MemoryController
  let memory: MemoryService

  beforeEach(async () => {
    store = new FakeFactStore()
    ;({ controller, memory } = wire(store))
    await controller.pinFact(member(ALICE), {
      fact: TEMPORARY,
      scope: 'conversation',
      conversationId: THREAD,
    } as PinFactDto)
    await controller.pinFact(member(ALICE), { fact: PERSONAL, scope: 'user' } as PinFactDto)
  })

  it('écrit la portée ET le fil DÉSIGNÉ — la clé est celle des autres mémoires de fil', () => {
    const row = store.rows.find(candidate => candidate.fact === TEMPORARY)
    expect(row).toMatchObject({ scope: 'conversation', conversation_id: THREAD, user_id: ALICE })
  })

  it('son auteur la lit DANS son fil — corpus non vide', async () => {
    const { facts } = await controller.listFacts(member(ALICE), { conversationId: THREAD } as ListFactsDto)
    expect(facts.map(fact => fact.fact)).toContain(TEMPORARY)
  })

  it('elle ne sort NI dans un autre fil, NI hors d’un fil, NI au registre de Réglages', async () => {
    const elsewhere = await controller.listFacts(member(ALICE), { conversationId: OTHER_THREAD } as ListFactsDto)
    expect(elsewhere.facts.map(fact => fact.fact)).not.toContain(TEMPORARY)
    const noThread = await controller.listFacts(member(ALICE), {})
    expect(noThread.facts.map(fact => fact.fact)).not.toContain(TEMPORARY)
    const ledger = await controller.readLedger(member(ALICE))
    expect(ledger.entries.map(entry => entry.text).join(' ')).not.toContain(TEMPORARY)
  })

  it('un collègue ne la lit dans AUCUN fil, pas même le sien', async () => {
    const { facts } = await controller.listFacts(member(BOB), { conversationId: THREAD } as ListFactsDto)
    expect(facts.map(fact => fact.fact)).not.toContain(TEMPORARY)
  })

  it('le fil supprimé l’emporte — et le « moi » d’à côté reste (témoin de sur-suppression)', async () => {
    await memory.forgetConversation({ workspaceId: WORKSPACE, accountId: null, conversationId: THREAD })
    expect(store.rows.map(row => row.fact)).not.toContain(TEMPORARY)
    expect(store.rows.map(row => row.fact)).toContain(PERSONAL)
  })

  it('supprimer un AUTRE fil n’emporte rien — la clé borne la suppression', async () => {
    await memory.forgetConversation({ workspaceId: WORKSPACE, accountId: null, conversationId: OTHER_THREAD })
    expect(store.rows.map(row => row.fact)).toContain(TEMPORARY)
  })
})
