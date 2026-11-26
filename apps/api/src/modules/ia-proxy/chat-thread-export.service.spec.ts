import { NotFoundException } from '@nestjs/common'
import type { ChatMessagesService } from './chat-messages.service'
import { ChatThreadExportService, type ChatThreadExportConfirmedCard } from './chat-thread-export.service'

/**
 * #1955.7 / #1955.17-.23 — l'AGRÉGATION réelle d'un export de fil : le fil lui-
 * même (`ChatMessagesService`), ses actions confirmées (#1955.22) et les
 * capacités non connectées (#1955.23).
 *
 * ⚠️ Les cartes confirmées et le registre d'outils ARRIVENT désormais en
 * argument : GA-07 refuse qu'un service aille chercher celui d'un autre module,
 * donc le contrôleur les lit et les passe. Que ce soit BIEN le principal de
 * l'appelant et BIEN la clé du fil qui servent à les lire est prouvé un cran
 * plus haut, par `ia-proxy.thread-export-orchestration.spec.ts`.
 */

const WS = 'ws-1'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function build(options: { thread?: unknown[]; accountRows?: unknown[] }) {
  const messages = {
    listThread: jest.fn().mockResolvedValue(options.thread ?? []),
  }
  const repo = {
    manager: { query: jest.fn().mockResolvedValue(options.accountRows ?? []) },
  }
  const service = new ChatThreadExportService(messages as unknown as ChatMessagesService, repo as never)
  return { service, messages, repo }
}

const OPENING_MESSAGE = {
  id: 'm1',
  account_id: ACCOUNT,
  conversation_id: 'c-1',
  role: 'user' as const,
  content: 'Prépare la relance.',
  created_at: new Date('2026-09-15T08:00:00.000Z'),
  voice_object_id: null,
  author: { firstName: 'Marie', avatarUrl: null },
}
const REPLY_MESSAGE = {
  ...OPENING_MESSAGE,
  id: 'm2',
  role: 'assistant' as const,
  content: 'Voici [le communiqué](https://presse.example/article).',
  created_at: new Date('2026-09-15T08:01:00.000Z'),
  author: null,
}

describe('ChatThreadExportService.build', () => {
  it('#3979.2 — une réponse à cartes sort en TEXTE : ni clôture ni JSON de carte', async () => {
    const card = JSON.stringify({ type: 'verdict', conclusion: 'Relancer cette semaine', reasons: ['Signal actif'] })
    const { service } = build({
      thread: [{ ...REPLY_MESSAGE, content: 'Voici ma lecture.\n\n```bellum-block\n' + card + '\n```' }],
    })
    const data = await service.build({
      userId: 'u-1',
      workspaceId: WS,
      accountId: null,
      conversationId: 'c-1',
      connectedTools: [],
      confirmedCards: [],
    })
    const text = data.messages[0]?.content ?? ''
    expect(text).toContain('Voici ma lecture.')
    expect(text).toContain('Relancer cette semaine')
    expect(text).not.toContain('bellum-block')
    expect(text).not.toContain('"type"')
  })

  it('lève 404 sur un fil introuvable dans cet espace — jamais un export vide', async () => {
    const { service } = build({ thread: [] })
    await expect(
      service.build({
        userId: 'u-1',
        workspaceId: WS,
        accountId: null,
        conversationId: 'c-1',
        connectedTools: [],
        confirmedCards: [],
      }),
    ).rejects.toThrow(NotFoundException)
  })

  it('agrège le fil, les auteurs, les sources, les actions confirmées et les limites', async () => {
    const { service } = build({
      thread: [OPENING_MESSAGE, REPLY_MESSAGE],
      accountRows: [{ id: ACCOUNT, companyName: 'Helios' }],
    })
    const confirmedCards = [
      {
        preview: {
          whatWillHappen: 'Créer un brouillon',
          targetObject: 'Jean Dupont',
          destination: 'votre messagerie',
        },
        result: { outcome: 'Le brouillon a été créé.', occurredAt: '2026-09-15T08:02:00.000Z' },
      },
    ] as unknown as ChatThreadExportConfirmedCard[]
    const result = await service.build({
      userId: 'u-1',
      workspaceId: WS,
      accountId: ACCOUNT,
      conversationId: 'c-1',
      connectedTools: [],
      confirmedCards,
    })

    expect(result.scope).toEqual({ accountId: ACCOUNT, accountName: 'Helios' })
    expect(result.authors).toEqual(['Marie'])
    expect(result.sources).toEqual([{ label: 'le communiqué', url: 'https://presse.example/article' }])
    expect(result.actions).toEqual([
      {
        whatWillHappen: 'Créer un brouillon',
        targetObject: 'Jean Dupont',
        destination: 'votre messagerie',
        outcome: 'Le brouillon a été créé.',
        occurredAt: '2026-09-15T08:02:00.000Z',
      },
    ])
    expect(result.limits.length).toBeGreaterThan(0)
  })

  it('#3895.5 — un fil sous la borne se déclare complet, un fil à la borne se déclare extrait', async () => {
    const small = build({ thread: [OPENING_MESSAGE, REPLY_MESSAGE] })
    const complete = await small.service.build({
      userId: 'u-1',
      workspaceId: WS,
      accountId: ACCOUNT,
      conversationId: 'c-1',
      connectedTools: [],
      confirmedCards: [],
    })
    expect(complete.coverage).toEqual({ messageCount: 2, truncated: false })
  })

  // #3895.8 (Louis 15/10/2026) — l'export d'une conversation Laura est le fil COMPLET : il remonte
  // page par page (curseur `before`) jusqu'au premier message, au lieu de s'arrêter aux 1 000 derniers.
  it('#3895.8 — un fil plus long qu’une page est exporté EN ENTIER, dans l’ordre, et se déclare complet', async () => {
    const at = (minute: number) => ({
      ...OPENING_MESSAGE,
      id: `m-${minute}`,
      content: `message ${minute}`,
      created_at: new Date(Date.UTC(2026, 8, 15, 8, minute)),
    })
    const older = Array.from({ length: 3 }, (_, i) => at(i))
    const latest = Array.from({ length: 1000 }, (_, i) => at(3 + i))
    const { service, messages } = build({})
    messages.listThread.mockResolvedValueOnce(latest).mockResolvedValueOnce(older)
    const result = await service.build({
      userId: 'u-1',
      workspaceId: WS,
      accountId: ACCOUNT,
      conversationId: 'c-1',
      connectedTools: [],
      confirmedCards: [],
    })
    expect(result.coverage).toEqual({ messageCount: 1003, truncated: false })
    expect(result.messages[0]?.content).toBe('message 0')
    expect(result.messages.at(-1)?.content).toBe('message 1002')
    expect(messages.listThread.mock.calls[1]?.[0]).toMatchObject({ before: latest[0]?.created_at })
  })

  it('#3895.8 — sait dire NON : au-delà de la borne de pages, l’export se DÉCLARE extrait', async () => {
    const page = Array.from({ length: 1000 }, () => OPENING_MESSAGE)
    const { service, messages } = build({ thread: page })
    const result = await service.build({
      userId: 'u-1',
      workspaceId: WS,
      accountId: ACCOUNT,
      conversationId: 'c-1',
      connectedTools: [],
      confirmedCards: [],
    })
    expect(messages.listThread).toHaveBeenCalledTimes(50)
    expect(result.coverage?.truncated).toBe(true)
  })

  // #3895.1 — « Extrait » ou « Fil complet » : l'utilisateur choisit ; l'export dit toujours ce qu'il porte.
  describe('#3895.1 — extrait ou fil complet', () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...OPENING_MESSAGE,
        id: `m${index}`,
        content: `Message ${index}`,
        created_at: new Date(Date.UTC(2026, 8, 15, 8, index)),
      }))
    const args = {
      userId: 'u-1',
      workspaceId: WS,
      accountId: null,
      conversationId: 'c-1',
      connectedTools: [],
      confirmedCards: [],
    }

    it('« Extrait » ne garde que les derniers messages et se DÉCLARE extrait', async () => {
      const { service, messages } = build({ thread: rows(31) })
      const data = await service.build({ ...args, scope: 'extract' })
      expect(data.messages).toHaveLength(30)
      expect(data.messages[0]?.content).toBe('Message 1')
      expect(data.messages.at(-1)?.content).toBe('Message 30')
      expect(data.coverage).toEqual({ messageCount: 30, truncated: true })
      // UNE seule lecture : l'extrait ne remonte pas tout le fil.
      expect(messages.listThread).toHaveBeenCalledTimes(1)
    })

    it('NON : un fil plus court que l’extrait se déclare complet, jamais « extrait » par réflexe', async () => {
      const { service } = build({ thread: rows(5) })
      const data = await service.build({ ...args, scope: 'extract' })
      expect(data.messages).toHaveLength(5)
      expect(data.coverage).toEqual({ messageCount: 5, truncated: false })
    })

    it('sans choix, le fil est COMPLET — le comportement de #3895.8 est inchangé', async () => {
      const { service } = build({ thread: rows(31) })
      const data = await service.build(args)
      expect(data.messages).toHaveLength(31)
      expect(data.coverage).toEqual({ messageCount: 31, truncated: false })
    })
  })

  it('#3895.5 — la version du produit vient du déploiement, jamais inventée', async () => {
    const previous = process.env['RAILWAY_GIT_COMMIT_SHA']
    try {
      process.env['RAILWAY_GIT_COMMIT_SHA'] = 'abcdef1234567890'
      const { service } = build({ thread: [OPENING_MESSAGE] })
      const args = {
        userId: 'u-1',
        workspaceId: WS,
        accountId: ACCOUNT,
        conversationId: 'c-1',
        connectedTools: [],
        confirmedCards: [],
      }
      expect((await service.build(args)).productVersion).toBe('abcdef1')
      delete process.env['RAILWAY_GIT_COMMIT_SHA']
      expect((await service.build(args)).productVersion).toBeNull()
    } finally {
      if (previous === undefined) delete process.env['RAILWAY_GIT_COMMIT_SHA']
      else process.env['RAILWAY_GIT_COMMIT_SHA'] = previous
    }
  })

  it('sans compte (portefeuille), le périmètre ne nomme aucun compte', async () => {
    const { service } = build({ thread: [{ ...OPENING_MESSAGE, account_id: null }] })
    const result = await service.build({
      userId: 'u-1',
      workspaceId: WS,
      accountId: null,
      conversationId: 'c-1',
      connectedTools: [],
      confirmedCards: [],
    })
    expect(result.scope).toEqual({ accountId: null, accountName: null })
  })
})
