import { FindOperator } from 'typeorm'
import { ChatMessagesService } from './chat-messages.service'
import type { ChatMessageEntity } from '../../database/entities/chat-message.entity'

/**
 * #2703 — À DEUX DANS UN ESPACE, LE FIL PAR DÉFAUT NE SE MÉLANGE PLUS.
 *
 * ⚠️ #2703 revient sur l'hypothèse « un utilisateur = un espace », délibérément.
 * Elle est écrite noir sur blanc dans `chat-messages.service.ts` (« Identical
 * behaviour today (1 user = 1 workspace) ») et elle a cessé d'être vraie le
 * 22/09/2026 : Apricot Labs paie deux sièges dans un même espace, et ses deux
 * membres écrivaient littéralement dans le même fil — « si nous sommes 2 dans
 * les messages, ils se superposent et se mélangent » (Bedros Astourian, CTO).
 *
 * CE QUI CHANGE : le fil par DÉFAUT (`account_id` et `conversation_id` à NULL,
 * ou un fil de compte sans conversation nommée) devient PRIVÉ — il appartient à
 * son auteur. C'est un brouillon personnel, c'est là que la collision est
 * certaine, et c'est ce que le client décrit comme handicapant.
 *
 * CE QUI TIENT : une conversation NOMMÉE (`conversation_id`) reste PARTAGÉE par
 * l'espace. C'est un travail qu'on veut pouvoir reprendre à plusieurs — et
 * chaque message y porte déjà son auteur (#1940.4), ce qui est justement ce
 * qu'une ressource d'équipe doit dire.
 *
 * CE QUI NE S'AFFAIBLIT JAMAIS : `workspace_id` reste dans CHAQUE lecture.
 * Ajouter le propriétaire ne retire pas le cloisonnement d'espace — les espaces
 * sont des ESN, donc des concurrents (troisième cas ci-dessous).
 *
 * L'EXISTANT : rien ne se migre et rien ne disparaît. `chat_messages.user_id`
 * porte l'auteur de chaque ligne depuis l'origine (écrit par `create` depuis le
 * JWT, y compris sur les réponses de Laura) : chaque membre RETROUVE ses propres
 * messages du fil par défaut, personne n'en perd, aucune ligne n'est touchée.
 *
 * 🔴 Aucun corps de message réel ici : les textes sont des repères ('q1', 'r1').
 */

type Row = Pick<ChatMessageEntity, 'id' | 'user_id' | 'workspace_id' | 'account_id' | 'conversation_id' | 'role'> & {
  content: string
  created_at: Date
}

/** Le seul opérateur que ces lectures posent est `IsNull()`. */
function matchesWhere(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as unknown as Record<string, unknown>)[key] ?? null
    if (expected instanceof FindOperator) return actual === null
    return actual === (expected ?? null)
  })
}

/** Un dépôt qui HONORE le `where` : ce test mesure des lignes rendues, pas une forme d'appel. */
function repositoryOf(rows: readonly Row[]) {
  const updated: Array<{ where: Record<string, unknown>; ids: string[] }> = []
  const repo = {
    find: jest.fn(async (opts: { where: Record<string, unknown> }) =>
      rows.filter(row => matchesWhere(row, opts.where)),
    ),
    findOne: jest.fn(
      async (opts: { where: Record<string, unknown> }) => rows.filter(row => matchesWhere(row, opts.where))[0] ?? null,
    ),
    count: jest.fn(
      async (opts: { where: Record<string, unknown> }) => rows.filter(row => matchesWhere(row, opts.where)).length,
    ),
    update: jest.fn(async (where: Record<string, unknown>, _patch: unknown) => {
      const ids = rows.filter(row => matchesWhere(row, where)).map(row => row.id)
      updated.push({ where, ids })
      return { affected: ids.length }
    }),
  }
  return { repo, updated }
}

const ws = 'ws-apricot'
const bedros = 'u-bedros'
const adel = 'u-adel'

/** Le fil PAR DÉFAUT des deux membres, mélangé tel qu'il l'était en base le 22/09. */
const defaultThread: Row[] = [
  {
    id: 'm1',
    user_id: bedros,
    workspace_id: ws,
    account_id: null,
    conversation_id: null,
    role: 'user',
    content: 'q1',
    created_at: new Date('2026-09-22T09:00:00Z'),
  },
  {
    id: 'm2',
    user_id: bedros,
    workspace_id: ws,
    account_id: null,
    conversation_id: null,
    role: 'assistant',
    content: 'r1',
    created_at: new Date('2026-09-22T09:00:05Z'),
  },
  {
    id: 'm3',
    user_id: adel,
    workspace_id: ws,
    account_id: null,
    conversation_id: null,
    role: 'user',
    content: 'q2',
    created_at: new Date('2026-09-22T09:01:00Z'),
  },
  {
    id: 'm4',
    user_id: adel,
    workspace_id: ws,
    account_id: null,
    conversation_id: null,
    role: 'assistant',
    content: 'r2',
    created_at: new Date('2026-09-22T09:01:05Z'),
  },
]

describe('#2703 — le fil par défaut appartient à son auteur', () => {
  it('deux membres du même espace ne voient chacun QUE leur propre fil par défaut', async () => {
    const { repo } = repositoryOf(defaultThread)
    const service = new ChatMessagesService(repo as never)

    const forBedros = await service.listThread({
      userId: bedros,
      workspaceId: ws,
      accountId: null,
      conversationId: null,
      limit: 50,
    })
    const forAdel = await service.listThread({
      userId: adel,
      workspaceId: ws,
      accountId: null,
      conversationId: null,
      limit: 50,
    })

    expect(forBedros.map(m => m.id).sort()).toEqual(['m1', 'm2'])
    expect(forAdel.map(m => m.id).sort()).toEqual(['m3', 'm4'])
  })

  it('le fil par défaut D’UN COMPTE suit la même règle : privé à son auteur', async () => {
    const rows: Row[] = defaultThread.map(row => ({ ...row, account_id: 'acc-1' }))
    const { repo } = repositoryOf(rows)
    const service = new ChatMessagesService(repo as never)

    const forBedros = await service.listThread({
      userId: bedros,
      workspaceId: ws,
      accountId: 'acc-1',
      conversationId: null,
      limit: 50,
    })
    expect(forBedros.map(m => m.id).sort()).toEqual(['m1', 'm2'])
  })

  it('une conversation NOMMÉE reste PARTAGÉE : les deux membres y lisent les quatre messages', async () => {
    const rows: Row[] = defaultThread.map(row => ({ ...row, conversation_id: 'c-1' }))
    const { repo } = repositoryOf(rows)
    const service = new ChatMessagesService(repo as never)

    const forBedros = await service.listThread({
      userId: bedros,
      workspaceId: ws,
      accountId: null,
      conversationId: 'c-1',
      limit: 50,
    })
    const forAdel = await service.listThread({
      userId: adel,
      workspaceId: ws,
      accountId: null,
      conversationId: 'c-1',
      limit: 50,
    })

    expect(forBedros.map(m => m.id).sort()).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(forAdel.map(m => m.id).sort()).toEqual(['m1', 'm2', 'm3', 'm4'])
  })

  it('le cloisonnement d’espace ne s’affaiblit pas : le même auteur dans un AUTRE espace ne remonte pas', async () => {
    const rows: Row[] = [
      ...defaultThread,
      {
        id: 'x1',
        user_id: bedros,
        workspace_id: 'ws-concurrent',
        account_id: null,
        conversation_id: null,
        role: 'user',
        content: 'q3',
        created_at: new Date('2026-09-22T09:02:00Z'),
      },
    ]
    const { repo } = repositoryOf(rows)
    const service = new ChatMessagesService(repo as never)

    const forBedros = await service.listThread({
      userId: bedros,
      workspaceId: ws,
      accountId: null,
      conversationId: null,
      limit: 50,
    })
    expect(forBedros.map(m => m.id)).not.toContain('x1')
  })

  it('ranger le fil par défaut ne range QUE le sien', async () => {
    const { repo, updated } = repositoryOf(defaultThread)
    const service = new ChatMessagesService(repo as never)

    const affected = await service.setThreadArchived({
      userId: bedros,
      workspaceId: ws,
      accountId: null,
      conversationId: null,
      archived: true,
    })

    expect(affected).toBe(2)
    expect(updated[0]?.ids.sort()).toEqual(['m1', 'm2'])
  })

  it('l’auteur du fil par défaut est CELUI QUI LE LIT, jamais le premier membre à avoir parlé', async () => {
    const { repo } = repositoryOf(defaultThread)
    const service = new ChatMessagesService(repo as never)

    await expect(
      service.threadAuthor({ userId: adel, workspaceId: ws, accountId: null, conversationId: null }),
    ).resolves.toBe(adel)
  })
})
