import { SHIPPED_PLAN_GRID } from '@bellum/contracts'
import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { FindOperator, In } from 'typeorm'
import type { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import type { ChatThreadTitleEntity } from '../../database/entities/chat-thread-title.entity'
import { createMockRepository } from '../../database/test-utils'
import { IA_COST_HEADER, type IaClient } from '../ia/ia.client'
import { ChatMessagesService } from './chat-messages.service'
import { QUOTA_WINDOW_MS } from './chat-quota'
import { ChatThreadTitlesService } from './chat-thread-titles.service'

/**
 * #1911.1 / #1911.12 / #1911.17 / #1955.1 — le titre d'un fil de Laura.
 *
 * Décision de Louis (12/09/2026) : « Rédigé par Laura, sans quota » — un titre
 * court écrit par un petit modèle après le 2e échange, hors des 50 messages du
 * jour, et modifiable à la main. Ce fichier tient les quatre promesses :
 *
 *  1. **quand** Laura titre : au 2e échange, une fois, jamais en coupure ;
 *  2. **une correction humaine gagne toujours** : le générateur n'écrit que là
 *     où aucun titre n'existe, et ne sait pas écraser ;
 *  3. **hors quota** : rédiger un titre n'écrit aucune ligne dans la seule table
 *     que le plafond compte — prouvé sur le VRAI `ChatMessagesService` ;
 *  4. **un échec ne dit rien du fil** : le titre reste le premier message, et le
 *     journal ne porte aucun mot de la conversation.
 */

const WS = 'ws-1'
const USER = 'u-1'
const REF = { userId: USER, workspaceId: WS, accountId: null, conversationId: 'c-1' }
const SECRET = 'Prépare mon rendez-vous avec la SNCF jeudi'
const OPENING = [
  { role: 'user' as const, content: SECRET },
  { role: 'assistant' as const, content: 'Voici les trois points à préparer.' },
  { role: 'user' as const, content: 'Qui voir à la direction digitale ?' },
  { role: 'assistant' as const, content: 'La direction digitale de SNCF Voyageurs.' },
]
const KILL_SWITCH = 'CHAT_THREAD_TITLES_DISABLED'

function build(options: { limit?: number | undefined } = {}) {
  const titles = createMockRepository<ChatThreadTitleEntity>()
  const messages = {
    threadExists: jest.fn().mockResolvedValue(true),
    exchangeCounts: jest.fn().mockResolvedValue({ user: 2, assistant: 2 }),
    threadOpening: jest.fn().mockResolvedValue(OPENING),
  }
  const ia = { chatThreadTitle: jest.fn().mockResolvedValue('Préparer le rendez-vous SNCF') }
  // #4016 L7 — `limit: undefined` posé = aucune variable sur l'hébergeur.
  const config = { get: jest.fn().mockReturnValue('limit' in options ? options.limit : 50) }
  const service = new ChatThreadTitlesService(
    titles as never,
    messages as unknown as ChatMessagesService,
    ia as unknown as IaClient,
    config as unknown as ConfigService,
  )
  return { service, titles, messages, ia, config }
}

afterEach(() => {
  delete process.env[KILL_SWITCH]
  jest.restoreAllMocks()
})

describe('titleAfterReply — quand Laura titre un fil (#1911.1)', () => {
  it('au 2e échange : rédige le titre, sans attendre plus de 15 s ni réessayer', async () => {
    const { service, titles, ia } = build()
    titles._qb.execute.mockResolvedValueOnce({ raw: [{ id: 't-1' }] })

    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('written')

    expect(ia.chatThreadTitle).toHaveBeenCalledWith(
      { messages: OPENING, locale: 'fr' },
      expect.objectContaining({ timeoutMs: 15_000, maxAttempts: 1, responseHeaderName: IA_COST_HEADER }),
    )
    expect(titles._qb.values).toHaveBeenCalledWith({
      workspace_id: WS,
      thread_key: 'c:c-1',
      title: 'Préparer le rendez-vous SNCF',
      title_source: 'laura',
      set_by: USER,
    })
  })

  it('rend à l’appelant l’en-tête de coût RÉEL rendu par le service IA — sans rien lire de son contenu', async () => {
    // #1911.1 — le coût de la rédaction s'enregistre dans `provider_costs` depuis
    // le contrôleur (GA-07 : ce service ne va pas chercher celui d'un autre
    // module). Ce service ne fait que TRANSMETTRE ce que l'IA a mesuré.
    const { service, ia } = build()
    const header = '[{"provider":"anthropic","operation":"bellum_chat_title","calls":1,"units":492,"cost_usd":0.00054}]'
    ia.chatThreadTitle.mockImplementationOnce(
      async (_input: unknown, opts: { onResponseHeader?: (name: string, value: string) => void }) => {
        opts.onResponseHeader?.(IA_COST_HEADER, header)
        return 'Préparer le rendez-vous SNCF'
      },
    )
    const onCostHeader = jest.fn()

    await service.titleAfterReply({ ...REF, userId: USER, onCostHeader })

    expect(onCostHeader).toHaveBeenCalledWith(header)
  })

  it('sait dire NON — aucun appel de modèle, aucun en-tête de coût transmis', async () => {
    const { service, messages } = build()
    messages.exchangeCounts.mockResolvedValueOnce({ user: 1, assistant: 1 })
    const onCostHeader = jest.fn()
    await service.titleAfterReply({ ...REF, userId: USER, onCostHeader })
    expect(onCostHeader).not.toHaveBeenCalled()
  })

  it('compte l’amorce de Laura comme une réponse de plus, pas comme un échange', async () => {
    // #1947 — l'amorce est écrite AVANT la première question : au 2e échange le
    // fil porte trois réponses de Laura pour deux questions.
    const { service, messages, ia } = build()
    messages.exchangeCounts.mockResolvedValueOnce({ user: 2, assistant: 3 })
    await service.titleAfterReply({ ...REF, userId: USER })
    expect(ia.chatThreadTitle).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['au 1er échange', { user: 1, assistant: 1 }],
    ['au 1er échange, amorce comprise', { user: 1, assistant: 2 }],
    ['au 3e échange', { user: 3, assistant: 3 }],
  ])('sait dire NON — %s, aucun appel de modèle', async (_label, counts) => {
    const { service, messages, ia } = build()
    messages.exchangeCounts.mockResolvedValueOnce(counts)
    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('not_second_exchange')
    expect(ia.chatThreadTitle).not.toHaveBeenCalled()
  })

  it('interrupteur posé : aucune lecture, aucun appel', async () => {
    process.env[KILL_SWITCH] = 'true'
    const { service, titles, messages, ia } = build()
    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('cut')
    expect(titles.findOne).not.toHaveBeenCalled()
    expect(messages.exchangeCounts).not.toHaveBeenCalled()
    expect(ia.chatThreadTitle).not.toHaveBeenCalled()
  })

  it('un titre qui n’est rien (blancs) ne s’écrit pas — le fil garde son premier message', async () => {
    const { service, titles, ia } = build()
    ia.chatThreadTitle.mockResolvedValueOnce('   ')
    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('no_title')
    expect(titles._qb.insert).not.toHaveBeenCalled()
  })

  it('un titre refusé par le service IA (null) ne s’écrit pas', async () => {
    const { service, titles, ia } = build()
    ia.chatThreadTitle.mockResolvedValueOnce(null)
    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('no_title')
    expect(titles._qb.insert).not.toHaveBeenCalled()
  })

  it('borne le nombre de titres rédigés par personne sur 24 h, par le plafond du copilote', async () => {
    // La route qui déclenche (`POST /ia/chat/messages`) est écrite par le
    // navigateur : sans borne, des fils fabriqués à la chaîne feraient autant
    // d'appels de modèle. Un fil titré demande deux échanges, donc deux messages
    // du plafond — la borne laisse deux fois la marge d'un usage réel.
    const { service, titles, ia } = build({ limit: 50 })
    titles.count.mockResolvedValueOnce(50)
    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('capped')
    expect(ia.chatThreadTitle).not.toHaveBeenCalled()
    const where = titles.count.mock.calls[0][0].where as Record<string, unknown>
    expect(where).toMatchObject({ workspace_id: WS, set_by: USER, title_source: 'laura' })
    expect(where['created_at']).toBeInstanceOf(FindOperator)
  })

  // #4016 L7 — le plafond opérateur est devenu OPTIONNEL : son absence
  // n'ouvre JAMAIS la rédaction sans borne (la route est écrite par le navigateur).
  it('aucun plafond opérateur posé : bornée au plus HAUT plafond de la grille, jamais illimitée', async () => {
    const highest = Math.max(...Object.values(SHIPPED_PLAN_GRID).map(row => row.chatDailyMessageLimit))
    const { service, titles, ia } = build({ limit: undefined })
    titles.count.mockResolvedValueOnce(highest)
    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('capped')
    expect(ia.chatThreadTitle).not.toHaveBeenCalled()
  })

  it('plafond du copilote désactivé (0) : pas de borne, comme pour le chat', async () => {
    const { service, titles, ia } = build({ limit: 0 })
    await service.titleAfterReply({ ...REF, userId: USER })
    expect(titles.count).not.toHaveBeenCalled()
    expect(ia.chatThreadTitle).toHaveBeenCalledTimes(1)
  })
})

describe('une correction humaine gagne toujours (#1911.12)', () => {
  it('sait dire NON — un titre saisi à la main existe : Laura ne lit même pas le fil', async () => {
    const { service, titles, messages, ia } = build()
    titles.findOne.mockResolvedValueOnce({ thread_key: 'c:c-1', title: 'Mon titre', title_source: 'user' })
    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('already_titled')
    expect(messages.exchangeCounts).not.toHaveBeenCalled()
    expect(ia.chatThreadTitle).not.toHaveBeenCalled()
    expect(titles._qb.insert).not.toHaveBeenCalled()
    expect(titles.upsert).not.toHaveBeenCalled()
  })

  it('le générateur n’a AUCUN chemin d’écrasement : il insère « si absent », jamais un upsert', async () => {
    // La course réelle : le titre n'existe pas quand Laura commence, la personne
    // renomme pendant l'appel au modèle. `ON CONFLICT DO NOTHING` laisse la
    // correction humaine en place — un upsert l'aurait écrasée.
    const { service, titles } = build()
    await service.titleAfterReply({ ...REF, userId: USER })
    expect(titles._qb.orIgnore).toHaveBeenCalledTimes(1)
    expect(titles.upsert).not.toHaveBeenCalled()
    expect(titles.update).not.toHaveBeenCalled()
  })

  it('renommer ÉCRASE, quel que soit l’auteur précédent', async () => {
    const { service, titles } = build()
    await expect(service.rename({ ...REF, userId: USER, title: 'Préparer le RDV SNCF' })).resolves.toEqual({
      title: 'Préparer le RDV SNCF',
      title_source: 'user',
    })
    expect(titles.upsert).toHaveBeenCalledWith(
      { workspace_id: WS, thread_key: 'c:c-1', title: 'Préparer le RDV SNCF', title_source: 'user', set_by: USER },
      { conflictPaths: ['workspace_id', 'thread_key'] },
    )
  })

  it('sait dire NON — un fil absent de CET espace ne se renomme pas', async () => {
    const { service, titles, messages } = build()
    messages.threadExists.mockResolvedValueOnce(false)
    await expect(service.rename({ ...REF, userId: USER, title: 'X' })).resolves.toBeNull()
    expect(messages.threadExists).toHaveBeenCalledWith(REF)
    expect(titles.upsert).not.toHaveBeenCalled()
  })

  // #2703 — la clé d'un fil PAR DÉFAUT porte désormais son propriétaire : deux
  // membres du même espace ne se renomment plus mutuellement leur fil personnel.
  it('un fil ancien sans clé de conversation se désigne par son compte ET par son auteur (#2703)', async () => {
    const { service, titles } = build()
    await service.rename({ workspaceId: WS, accountId: 'a-1', conversationId: null, userId: USER, title: 'X' })
    expect(titles.upsert.mock.calls[0][0]).toMatchObject({ thread_key: `a:a-1|u:${USER}` })
  })
})

describe('withStoredTitles — la liste montre le titre stocké', () => {
  const items = [
    { id: 'm-1', account_id: null, conversation_id: 'c-1', title: SECRET },
    { id: 'm-2', account_id: 'a-1', conversation_id: null, title: 'Compare mes comptes suivis' },
  ]

  it('remplace le premier message par le titre stocké, et dit qui l’a écrit', async () => {
    const { service, titles } = build()
    titles.find.mockResolvedValueOnce([
      { thread_key: 'c:c-1', title: 'Préparer le rendez-vous SNCF', title_source: 'laura' },
    ])
    const shown = await service.withStoredTitles(WS, USER, items)
    expect(shown).toEqual([
      { ...items[0], title: 'Préparer le rendez-vous SNCF', title_source: 'laura' },
      { ...items[1], title_source: null },
    ])
    expect(titles.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: WS, thread_key: In(['c:c-1', `a:a-1|u:${USER}`]) } }),
    )
  })

  it('une lecture de titres qui échoue ne fait pas tomber la liste — le premier message reste', async () => {
    const { service, titles } = build()
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    titles.find.mockRejectedValueOnce(new Error('db down'))
    const shown = await service.withStoredTitles(WS, USER, items)
    expect(shown.map(item => item.title)).toEqual([SECRET, 'Compare mes comptes suivis'])
    expect(warn).toHaveBeenCalled()
  })

  it('une liste vide ne lit rien', async () => {
    const { service, titles } = build()
    await expect(service.withStoredTitles(WS, USER, [])).resolves.toEqual([])
    expect(titles.find).not.toHaveBeenCalled()
  })
})

describe('forget — un fil supprimé emporte son titre', () => {
  it('efface le titre du fil dans CET espace', async () => {
    const { service, titles } = build()
    await service.forget(REF)
    expect(titles.delete).toHaveBeenCalledWith({ workspace_id: WS, thread_key: 'c:c-1' })
  })
})

describe('un échec ne dit rien du fil (#1911.1)', () => {
  it('le modèle échoue : rien n’est écrit, et le journal ne porte aucun mot de la conversation', async () => {
    const { service, titles, ia } = build()
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    ia.chatThreadTitle.mockRejectedValueOnce(new Error(`IA 502 — ${SECRET}`))

    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('failed')

    expect(titles._qb.insert).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).not.toContain('SNCF')
    expect(logged).not.toContain('rendez-vous')
  })

  it('une lecture du fil échoue : même silence sur le contenu, aucune exception ne remonte', async () => {
    const { service, messages, ia } = build()
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    messages.exchangeCounts.mockRejectedValueOnce(new Error('db down'))
    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('failed')
    expect(ia.chatThreadTitle).not.toHaveBeenCalled()
  })
})

/**
 * Hors quota — la preuve sur le VRAI compteur.
 *
 * Le plafond quotidien (`assertChatQuota` → `measureUserMessagesSince`) compte
 * des LIGNES `chat_messages` de rôle `user`. On fait tourner le vrai
 * `ChatMessagesService` sur un dépôt EN MÉMOIRE qui interprète les mêmes
 * opérateurs que la base (`MoreThanOrEqual`, `Not(IsNull())`), puis on mesure
 * avant et après : rédiger un titre ne doit rien changer, écrire un message de
 * la personne, si.
 */
describe('hors quota — le titre ne consomme aucun message du plafond', () => {
  type Row = Partial<ChatMessageEntity>

  function operatorMatches(value: unknown, operator: FindOperator<unknown>): boolean {
    switch (operator.type) {
      case 'isNull':
        return value === null || value === undefined
      case 'not':
        return operator.child ? !operatorMatches(value, operator.child) : value !== operator.value
      case 'moreThanOrEqual':
        return (value as Date).getTime() >= (operator.value as Date).getTime()
      default:
        throw new Error(`Opérateur non simulé : ${operator.type}`)
    }
  }

  function matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, expected]) => {
      const value = (row as Record<string, unknown>)[key] ?? null
      return expected instanceof FindOperator ? operatorMatches(value, expected) : value === expected
    })
  }

  function inMemoryMessages(rows: Row[]) {
    const byDate = (direction: 'ASC' | 'DESC') => (a: Row, b: Row) =>
      ((a.created_at?.getTime() ?? 0) - (b.created_at?.getTime() ?? 0)) * (direction === 'ASC' ? 1 : -1)
    return {
      count: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) => rows.filter(row => matches(row, where)).length,
      ),
      find: jest.fn(
        async ({
          where,
          order,
          take,
        }: {
          where: Record<string, unknown>
          order?: { created_at: 'ASC' | 'DESC' }
          take?: number
        }) =>
          rows
            .filter(row => matches(row, where))
            .sort(byDate(order?.created_at ?? 'ASC'))
            .slice(0, take ?? rows.length),
      ),
      findOne: jest.fn(
        async ({ where, order }: { where: Record<string, unknown>; order?: { created_at: 'ASC' | 'DESC' } }) =>
          rows.filter(row => matches(row, where)).sort(byDate(order?.created_at ?? 'ASC'))[0] ?? null,
      ),
      create: jest.fn((entity: Row) => entity),
      save: jest.fn(async (entity: Row) => {
        const saved = { ...entity, id: `m-${rows.length + 1}`, created_at: new Date() }
        rows.push(saved)
        return saved
      }),
      update: jest.fn(),
      insert: jest.fn(),
    }
  }

  function threadRows(): Row[] {
    const now = Date.now()
    return OPENING.map((message, index) => ({
      id: `m-${index + 1}`,
      user_id: USER,
      workspace_id: WS,
      account_id: null,
      conversation_id: 'c-1',
      role: message.role,
      content: message.content,
      created_at: new Date(now - (OPENING.length - index) * 1000),
      precision_request_at: null,
      quota_exempt_at: null,
    }))
  }

  function realPair() {
    const messagesRepo = inMemoryMessages(threadRows())
    const chatMessages = new ChatMessagesService(messagesRepo as never)
    const titles = createMockRepository<ChatThreadTitleEntity>()
    titles._qb.execute.mockResolvedValue({ raw: [{ id: 't-1' }] })
    const ia = { chatThreadTitle: jest.fn().mockResolvedValue('Préparer le rendez-vous SNCF') }
    const service = new ChatThreadTitlesService(
      titles as never,
      chatMessages,
      ia as unknown as IaClient,
      { get: () => 50 } as unknown as ConfigService,
    )
    return { messagesRepo, chatMessages, service, ia }
  }

  it('rédiger le titre n’écrit AUCUNE ligne dans chat_messages — le compte du plafond ne bouge pas', async () => {
    const { messagesRepo, chatMessages, service, ia } = realPair()
    const since = new Date(Date.now() - QUOTA_WINDOW_MS)
    const before = await chatMessages.measureUserMessagesSince(USER, since)
    expect(before.total).toBe(2)

    await expect(service.titleAfterReply({ ...REF, userId: USER })).resolves.toBe('written')

    expect(ia.chatThreadTitle).toHaveBeenCalledTimes(1)
    expect(await chatMessages.measureUserMessagesSince(USER, since)).toEqual(before)
    expect(messagesRepo.save).not.toHaveBeenCalled()
    expect(messagesRepo.insert).not.toHaveBeenCalled()
    expect(messagesRepo.update).not.toHaveBeenCalled()
  })

  it('sait dire NON — un message de la personne, lui, compte', async () => {
    // Témoin : le même compteur, sur le même dépôt, bouge quand il doit bouger.
    // Sans lui, le test précédent passerait aussi sur un compteur toujours à 2.
    const { chatMessages } = realPair()
    const since = new Date(Date.now() - QUOTA_WINDOW_MS)
    const before = await chatMessages.measureUserMessagesSince(USER, since)
    await chatMessages.create({
      userId: USER,
      workspaceId: WS,
      accountId: null,
      conversationId: 'c-1',
      role: 'user',
      content: 'Et ensuite ?',
    })
    expect((await chatMessages.measureUserMessagesSince(USER, since)).total).toBe(before.total + 1)
  })

  it('le compteur des titres est une AUTRE borne, sur une autre table', async () => {
    // La borne des titres (`capped`) ne lit jamais `chat_messages` : elle ne peut
    // donc ni consommer ni rouvrir le plafond du copilote.
    const { messagesRepo, service } = realPair()
    await service.titleAfterReply({ ...REF, userId: USER })
    const countedWheres = messagesRepo.count.mock.calls.map(call => call[0].where as Record<string, unknown>)
    expect(countedWheres.length).toBeGreaterThan(0)
    expect(countedWheres.every(where => !('set_by' in where))).toBe(true)
  })
})
