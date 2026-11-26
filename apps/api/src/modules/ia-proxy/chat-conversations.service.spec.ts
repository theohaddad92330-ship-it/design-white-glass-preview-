import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ChatConversationsService } from './chat-conversations.service'
import type {
  ChatConversationEntity,
  ChatConversationVersionEntity,
} from '../../database/entities/chat-conversation.entity'

/**
 * #2430.2 / .4 / .10 / .11 / .12 — l'objet conversation, sur des dépôts à ÉTAT
 * (une écriture se relit), pour que chaque test prouve ce qui a été persisté et
 * pas seulement qu'une méthode a été appelée.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'
const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MALLORY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CONV = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const MSG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ACCOUNT = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

type Row = Partial<ChatConversationEntity>
type VersionRow = Partial<ChatConversationVersionEntity>

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value)
}

function statefulRepo<T extends Record<string, unknown>>(rows: T[], conflict: (keyof T)[]) {
  return {
    rows,
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => rows.find(r => matches(r, where)) ?? null,
    ),
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.filter(r => matches(r, where)).sort((a, b) => Number(a.version ?? 0) - Number(b.version ?? 0)),
    ),
    upsert: jest.fn(async (value: T) => {
      const existing = rows.find(r => conflict.every(key => r[key] === value[key]))
      if (existing) Object.assign(existing, value)
      else rows.push({ ...value })
    }),
    insert: jest.fn(async (value: T) => {
      rows.push({ ...value, created_at: new Date('2026-09-22T20:00:00Z') })
    }),
  }
}

function setup(
  options: {
    threads?: string[]
    opener?: string | null
    accounts?: string[]
    /** #1955.12 — les comptes cités par les messages du fil. */
    cited?: string[]
    /** #1955.12 — qui porte chaque compte (`assigned_to`), `null` = libre. */
    owners?: Record<string, string | null>
    /** #4996 L3 — comptes dont le lecteur est co-équipier actif. */
    teammateOf?: string[]
  } = {},
) {
  const conversations = statefulRepo<Row & Record<string, unknown>>([], ['workspace_id', 'conversation_id'])
  const versions = statefulRepo<VersionRow & Record<string, unknown>>(
    [],
    ['workspace_id', 'conversation_id', 'version'],
  )
  const threads = new Set(options.threads ?? [CONV])
  const messages = {
    threadExists: jest.fn(
      async (t: { workspaceId: string; conversationId: string | null }) =>
        t.workspaceId === WS && t.conversationId !== null && threads.has(t.conversationId),
    ),
    threadAuthor: jest.fn(async () => (options.opener === undefined ? ALICE : options.opener)),
    messageInThread: jest.fn(async (_t: unknown, id: string) => id === MSG),
    lastThreadMessage: jest.fn(async (t: { workspaceId: string; conversationId: string | null }) =>
      t.workspaceId === WS && t.conversationId && threads.has(t.conversationId)
        ? { id: MSG, created_at: new Date('2026-09-22T19:00:00Z') }
        : null,
    ),
    threadAccountIds: jest.fn(async () => options.cited ?? []),
  }
  const owners: Record<string, string | null> = options.owners ?? { [ACCOUNT]: null }
  const accounts = {
    manager: { query: jest.fn(async () => (options.teammateOf ?? []).map(account_id => ({ account_id }))) },
    exist: jest.fn(
      async ({ where }: { where: { id: string; workspace_id: string } }) =>
        where.workspace_id === WS && (options.accounts ?? [ACCOUNT]).includes(where.id),
    ),
    // `In([...])` : l'opérateur porte ses valeurs dans `_value` (TypeORM).
    find: jest.fn(async ({ where }: { where: { id: { _value: string[] }; workspace_id: string } }) =>
      where.workspace_id === WS
        ? where.id._value.filter(id => id in owners).map(id => ({ id, assigned_to: owners[id] }))
        : [],
    ),
  }
  const service = new ChatConversationsService(
    conversations as never,
    versions as never,
    messages as never,
    accounts as never,
  )
  return { service, conversations, versions, messages }
}

const ref = { workspaceId: WS, userId: ALICE, conversationId: CONV }

describe('ChatConversationsService — #2430.11 le détail étend le fil, sans ligne inventée', () => {
  it('une conversation SANS ligne rend le comportement d’avant : propriétaire = qui l’a ouverte', async () => {
    const { service, conversations } = setup()
    const detail = await service.detail(ref)
    expect(detail).toEqual({
      conversationId: CONV,
      ownerUserId: ALICE,
      ownerSource: 'opener',
      parentConversationId: null,
      branchedFromMessageId: null,
      attachedAccountId: null,
      auditSnapshot: null,
      legalHold: null,
      versions: [],
    })
    // Lire n'écrit rien : aucune ligne fabriquée par une lecture.
    expect(conversations.rows).toHaveLength(0)
  })

  it('un fil qui n’existe pas DANS CET ESPACE rend null — jamais un objet d’un autre espace', async () => {
    const { service } = setup()
    expect(await service.detail({ ...ref, workspaceId: OTHER_WS })).toBeNull()
    expect(await service.detail({ ...ref, conversationId: 'inconnue' })).toBeNull()
  })
})

describe('ChatConversationsService — #2430.2 une autre hypothèse ouvre une BRANCHE', () => {
  it('crée un fil NEUF relié à son origine, sans toucher un message du parent', async () => {
    const { service, conversations, messages } = setup()
    const { conversationId } = await service.branch({ ...ref, fromConversationId: CONV, fromMessageId: MSG })
    expect(conversationId).not.toBe(CONV)
    expect(conversations.rows).toEqual([
      expect.objectContaining({
        workspace_id: WS,
        conversation_id: conversationId,
        parent_conversation_id: CONV,
        branched_from_message_id: MSG,
        owner_user_id: ALICE,
        created_by: ALICE,
      }),
    ])
    // La branche existe AVANT son premier message : le détail la lit par sa ligne.
    const detail = await service.detail({ ...ref, conversationId })
    expect(detail?.parentConversationId).toBe(CONV)
    expect(detail?.ownerSource).toBe('declared')
    expect(await service.parentOf(WS, conversationId)).toBe(CONV)
    expect(messages.threadAuthor).not.toHaveBeenCalledWith(expect.objectContaining({ conversationId }))
  })

  it('refuse de brancher un fil absent de l’espace, ou depuis une réponse qui n’y est pas', async () => {
    const { service, conversations } = setup()
    await expect(service.branch({ ...ref, workspaceId: OTHER_WS, fromConversationId: CONV })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(
      service.branch({ ...ref, fromConversationId: CONV, fromMessageId: '99999999-9999-4999-8999-999999999999' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(conversations.rows).toHaveLength(0)
  })
})

describe('ChatConversationsService — #2430.12 changer le propriétaire, rattacher à un objet', () => {
  it('l’ouvreur transfère à un MEMBRE de l’espace ; le propriétaire déclaré fait foi ensuite', async () => {
    const { service } = setup()
    await service.setOwner({ ...ref, canManage: false, ownerUserId: BOB, ownerIsMember: true })
    expect(await service.ownerOf(ref)).toBe(BOB)
    const detail = await service.detail(ref)
    expect(detail).toEqual(expect.objectContaining({ ownerUserId: BOB, ownerSource: 'declared' }))
    // Alice n'est plus propriétaire : elle ne peut plus transférer…
    await expect(
      service.setOwner({ ...ref, canManage: false, ownerUserId: ALICE, ownerIsMember: true }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    // …mais un gérant de l'espace le peut.
    await service.setOwner({ ...ref, canManage: true, ownerUserId: ALICE, ownerIsMember: true })
    expect(await service.ownerOf(ref)).toBe(ALICE)
  })

  it('refuse un propriétaire qui n’est pas membre de l’espace (les espaces sont des concurrents)', async () => {
    const { service, conversations } = setup()
    await expect(
      service.setOwner({ ...ref, canManage: true, ownerUserId: MALLORY, ownerIsMember: false }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(conversations.rows).toHaveLength(0)
  })

  it('rattache à un compte DE L’ESPACE, détache par null, refuse un compte d’ailleurs', async () => {
    const { service } = setup()
    await service.attach({ ...ref, accountId: ACCOUNT })
    expect((await service.detail(ref))?.attachedAccountId).toBe(ACCOUNT)
    await service.attach({ ...ref, accountId: null })
    expect((await service.detail(ref))?.attachedAccountId).toBeNull()
    await expect(service.attach({ ...ref, accountId: '99999999-9999-4999-8999-999999999999' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('ChatConversationsService — #2075.29 / #2075.30 le snapshot audit à l’ouverture du fil', () => {
  it('pose le snapshot sur un fil qui n’a PAS ENCORE de ligne ni de message (le CTA le précède)', async () => {
    const { service, conversations } = setup({ threads: [] })
    await service.attachAuditSnapshot({
      ...ref,
      snapshot: { auditVersion: 4, strategy: 'topDown', firstActions: ['Relancer les comptes tièdes'], unknowns: [] },
    })
    const detail = await service.detail(ref)
    expect(detail?.auditSnapshot).toEqual({
      auditVersion: 4,
      strategy: 'topDown',
      firstActions: ['Relancer les comptes tièdes'],
      unknowns: [],
      takenAt: expect.any(String),
    })
    expect(conversations.rows).toHaveLength(1)
  })

  it('NOMME les inconnues plutôt que de les taire — jamais une valeur inventée', async () => {
    const { service } = setup()
    await service.attachAuditSnapshot({
      ...ref,
      snapshot: {
        auditVersion: null,
        strategy: null,
        firstActions: [],
        unknowns: ['Aucune source ne renseigne encore le budget de fronts'],
      },
    })
    const detail = await service.detail(ref)
    expect(detail?.auditSnapshot?.unknowns).toEqual(['Aucune source ne renseigne encore le budget de fronts'])
    expect(detail?.auditSnapshot?.auditVersion).toBeNull()
    expect(detail?.auditSnapshot?.strategy).toBeNull()
  })

  it('un second snapshot REMPLACE le précédent (dernier geste gagne)', async () => {
    const { service } = setup()
    await service.attachAuditSnapshot({
      ...ref,
      snapshot: { auditVersion: 1, strategy: 'referral', firstActions: [], unknowns: [] },
    })
    await service.attachAuditSnapshot({
      ...ref,
      snapshot: { auditVersion: 2, strategy: 'bottomUp', firstActions: [], unknowns: [] },
    })
    const detail = await service.detail(ref)
    expect(detail?.auditSnapshot).toEqual(expect.objectContaining({ auditVersion: 2, strategy: 'bottomUp' }))
  })
})

describe('ChatConversationsService — #2430.10 / #2439.13 conservation légale', () => {
  it('un gérant la pose et la lève ; le fil sous conservation se lit comme tel', async () => {
    const { service } = setup()
    expect(await service.isOnLegalHold(WS, CONV)).toBe(false)
    await service.setLegalHold({ ...ref, canManage: true, hold: true, reason: 'Litige en cours (dossier 2026-114)' })
    expect(await service.isOnLegalHold(WS, CONV)).toBe(true)
    expect((await service.detail(ref))?.legalHold).toEqual({
      since: expect.any(String),
      by: ALICE,
      reason: 'Litige en cours (dossier 2026-114)',
      reviewBy: null,
    })
    await service.setLegalHold({ ...ref, canManage: true, hold: false })
    expect(await service.isOnLegalHold(WS, CONV)).toBe(false)
  })

  // #2439.13 — le délai de revue est DÉCLARÉ par qui pose la conservation,
  // jamais calculé : absent, le comportement ne change pas (ci-dessus).
  it('porte une date de revue quand le gérant la déclare', async () => {
    const { service } = setup()
    await service.setLegalHold({
      ...ref,
      canManage: true,
      hold: true,
      reason: 'Litige en cours (dossier 2026-114)',
      reviewBy: '2027-01-01T00:00:00.000Z',
    })
    expect((await service.detail(ref))?.legalHold).toEqual({
      since: expect.any(String),
      by: ALICE,
      reason: 'Litige en cours (dossier 2026-114)',
      reviewBy: '2027-01-01T00:00:00.000Z',
    })
  })

  it('efface la date de revue en même temps que le reste, à la levée', async () => {
    const { service } = setup()
    await service.setLegalHold({
      ...ref,
      canManage: true,
      hold: true,
      reason: 'Litige en cours',
      reviewBy: '2027-01-01T00:00:00.000Z',
    })
    await service.setLegalHold({ ...ref, canManage: true, hold: false })
    await service.setLegalHold({ ...ref, canManage: true, hold: true, reason: 'Nouveau litige' })
    expect((await service.detail(ref))?.legalHold).toEqual({
      since: expect.any(String),
      by: ALICE,
      reason: 'Nouveau litige',
      reviewBy: null,
    })
  })

  it('refuse la conservation légale à qui ne gère pas l’espace', async () => {
    const { service } = setup()
    await expect(
      service.setLegalHold({ ...ref, canManage: false, hold: true, reason: 'Litige en cours' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(await service.isOnLegalHold(WS, CONV)).toBe(false)
  })

  // #2439.13 — « expliquer pourquoi » est la première exigence : une
  // conservation posée sans raison est un blocage muet.
  it('refuse de poser une conservation légale sans raison', async () => {
    const { service } = setup()
    await expect(service.setLegalHold({ ...ref, canManage: true, hold: true })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(service.setLegalHold({ ...ref, canManage: true, hold: true, reason: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(await service.isOnLegalHold(WS, CONV)).toBe(false)
  })
})

describe('ChatConversationsService — #2430.4 / .11 version figée = une BORNE, jamais une copie', () => {
  it('figer numérote 1, 2… et borne au dernier message du fil', async () => {
    const { service, versions } = setup()
    const first = await service.snapshot(ref)
    const second = await service.snapshot(ref)
    expect(first).toEqual(expect.objectContaining({ version: 1, upToMessageId: MSG, createdBy: ALICE }))
    expect(second.version).toBe(2)
    expect(versions.rows).toHaveLength(2)
    expect(await service.versionBound(WS, CONV, 1)).toEqual(new Date('2026-09-22T19:00:00Z'))
    expect(await service.versionBound(OTHER_WS, CONV, 1)).toBeNull()
    expect((await service.detail(ref))?.versions.map(v => v.version)).toEqual([1, 2])
  })

  it('un fil vide ou d’un autre espace ne se fige pas', async () => {
    const { service, versions } = setup()
    await expect(service.snapshot({ ...ref, workspaceId: OTHER_WS })).rejects.toBeInstanceOf(NotFoundException)
    expect(versions.rows).toHaveLength(0)
  })
})

describe('ChatConversationsService — #1955.12 un fil partagé exige les droits sur les comptes qu’il cite', () => {
  const OTHER_ACCOUNT = '12121212-1212-4212-8212-121212121212'

  it('un compte porté par un COLLÈGUE, cité dans le fil, le rend illisible en portefeuille cloisonné', async () => {
    const { service } = setup({ cited: [ACCOUNT, OTHER_ACCOUNT], owners: { [ACCOUNT]: null, [OTHER_ACCOUNT]: BOB } })
    expect(await service.citesAccountOutside(ref, ALICE)).toBe(true)
    // Bob, lui, porte le compte : le fil lui reste lisible.
    expect(await service.citesAccountOutside({ ...ref, userId: BOB }, BOB)).toBe(false)
  })

  it('un compte LIBRE ou porté par le lecteur ne ferme rien', async () => {
    const { service } = setup({ cited: [ACCOUNT], owners: { [ACCOUNT]: ALICE } })
    expect(await service.citesAccountOutside(ref, ALICE)).toBe(false)
  })

  it('le compte RATTACHÉ compte aussi comme cité', async () => {
    const { service } = setup({ cited: [], owners: { [ACCOUNT]: BOB } })
    await service.attach({ ...ref, accountId: ACCOUNT })
    expect(await service.citesAccountOutside(ref, ALICE)).toBe(true)
  })

  it('#4996 L3 — co-équipier actif du compte porté par un collègue : le fil reste lisible ; non-membre : fermé', async () => {
    const withTeam = setup({ cited: [OTHER_ACCOUNT], owners: { [OTHER_ACCOUNT]: BOB }, teammateOf: [OTHER_ACCOUNT] })
    expect(await withTeam.service.citesAccountOutside(ref, ALICE)).toBe(false)
    const without = setup({ cited: [OTHER_ACCOUNT], owners: { [OTHER_ACCOUNT]: BOB } })
    expect(await without.service.citesAccountOutside(ref, ALICE)).toBe(true)
  })

  it('NON — un fil qui ne cite aucun compte ne lit aucun compte', async () => {
    const { service } = setup({ cited: [] })
    const accountsFind = (service as unknown as { accounts: { find: jest.Mock } }).accounts.find
    expect(await service.citesAccountOutside(ref, ALICE)).toBe(false)
    expect(accountsFind).not.toHaveBeenCalled()
  })
})
