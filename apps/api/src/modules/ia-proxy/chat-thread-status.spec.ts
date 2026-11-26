import { ChatMessagesService } from './chat-messages.service'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #1911.5 — LE FAIT QUI PERMET DE DIRE « EN ATTENTE » OU « REÇU ».
 *
 * L'API servait `created_at`, `last_message_at`, l'auteur, le titre et le nom du
 * compte d'un fil — jamais le RÔLE de son dernier message. « Laura n'a pas
 * encore répondu » n'était donc dérivable de rien : c'est le fait qui manquait,
 * et c'est celui que ce lot fait remonter.
 *
 * ⚠️ Il ne peut pas sortir de la fenêtre `MAX(created_at)` déjà en place :
 * `threadsBaseQuery` filtre `role = 'user'` dans son WHERE, et Postgres applique
 * le WHERE AVANT les fonctions de fenêtre — la partition ne voit donc jamais une
 * réponse de Laura. D'où une lecture SÉPARÉE, sur les fils réellement rendus.
 *
 * ⚠️ Cette garde est née sur la branche `feat/fil-statut-et-contexte-16-09`,
 * contre une lecture par `QueryBuilder`. Elle a été RAMENÉE sur l'implémentation
 * déjà en production (`LAST_MESSAGE_ROLE_SQL` passé à `manager.query`, clé de fil
 * = `conversation_id ?? id`) à la fusion de la vague 17 : les six comportements
 * qu'elle tient sont les mêmes, et cette implémentation-là n'avait AUCUN test.
 */
describe('#1911.5 — le rôle du dernier message de chaque fil', () => {
  let service: ChatMessagesService
  let repo: MockRepository<ChatMessageEntity>

  /** Un fil rendu par la requête des fils (la ligne d'ouverture, côté SQL). */
  const thread = (row: { id: string; conversation_id: string | null; account_id?: string | null }) => ({
    id: row.id,
    user_id: null,
    account_id: row.account_id ?? null,
    conversation_id: row.conversation_id,
    content: 'Où en est Latécoère ?',
    created_at: new Date('2026-09-16T08:00:00Z'),
    last_message_at: new Date('2026-09-16T08:00:00Z'),
  })

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    Object.assign(repo._qb, {
      from: jest.fn().mockReturnValue(repo._qb),
      setParameters: jest.fn().mockReturnValue(repo._qb),
      getQuery: jest.fn().mockReturnValue('SELECT 1'),
      getParameters: jest.fn().mockReturnValue({}),
    })
    Object.assign(repo.manager, { createQueryBuilder: jest.fn().mockReturnValue(repo._qb) })
    repo.manager.query.mockReset()
    repo.manager.query.mockResolvedValue([])
    service = new ChatMessagesService(repo as never)
  })

  it('sert « assistant » quand Laura a écrit en dernier — le fil est REÇU', async () => {
    repo._qb.getRawMany.mockResolvedValueOnce([thread({ id: 'm-1', conversation_id: 'conv-1' })])

    repo.manager.query.mockResolvedValueOnce([{ threadKey: 'conv-1', role: 'assistant' }])
    const [item] = await service.listHistory('ws-1', 'u-1', 20)
    expect(item.last_message_role).toBe('assistant')
  })

  it('sert « user » quand la personne a écrit en dernier — le fil est EN ATTENTE', async () => {
    repo._qb.getRawMany.mockResolvedValueOnce([thread({ id: 'm-1', conversation_id: 'conv-1' })])

    repo.manager.query.mockResolvedValueOnce([{ threadKey: 'conv-1', role: 'user' }])
    const [item] = await service.listHistory('ws-1', 'u-1', 20)
    expect(item.last_message_role).toBe('user')
  })

  /**
   * LE TÉMOIN DE COMPATIBILITÉ. Une base qui ne rend rien pour un fil (lecture
   * impossible, fil d'un autre espace, rôle inconnu du produit) laisse le champ
   * à `null` : l'écran n'affiche alors AUCUNE pastille. « Non mesuré » n'est pas
   * « en attente » — un fil sans état lu ne doit pas se lire comme un fil dont
   * Laura doit quelque chose.
   */
  it('laisse `null` quand le dernier rôle n’est pas lisible — jamais un état deviné', async () => {
    repo._qb.getRawMany.mockResolvedValueOnce([thread({ id: 'm-1', conversation_id: 'conv-1' })])

    repo.manager.query.mockResolvedValueOnce([{ threadKey: 'conv-1', role: 'moderator' }])
    const [item] = await service.listHistory('ws-1', 'u-1', 20)
    expect(item.last_message_role).toBeNull()
  })

  /** Un fil ANCIEN, sans `conversation_id` : sa clé est l'id de son message
   *  d'ouverture (`threadKeyOfRow`), la même que le SQL calcule par
   *  `COALESCE(conversation_id, id::text)`. */
  it('retrouve aussi un fil ancien, sans `conversation_id`', async () => {
    repo._qb.getRawMany.mockResolvedValueOnce([thread({ id: 'm-1', conversation_id: null, account_id: 'acc-7' })])

    repo.manager.query.mockResolvedValueOnce([{ threadKey: 'm-1', role: 'assistant' }])
    const [item] = await service.listHistory('ws-1', 'u-1', 20)
    expect(item.last_message_role).toBe('assistant')
  })

  /** La garde LIT quelque chose : sans fil rendu, AUCUNE seconde requête n'est
   *  lancée — une liste vide ne coûte pas un aller-retour de base de plus. */
  it('ne lit rien de plus quand la liste est vide', async () => {
    repo._qb.getRawMany.mockResolvedValueOnce([])
    await service.listHistory('ws-1', 'u-1', 20)
    expect(repo.manager.query).not.toHaveBeenCalled()
  })

  it('sert le même fait à la RECHERCHE — sinon la pastille disparaît en cherchant', async () => {
    repo._qb.getRawMany.mockResolvedValueOnce([thread({ id: 'm-1', conversation_id: 'conv-1' })])

    repo.manager.query.mockResolvedValueOnce([{ threadKey: 'conv-1', role: 'assistant' }])
    const [item] = await service.searchThreads('ws-1', 'u-1', 'Latécoère', 20)
    expect(item.last_message_role).toBe('assistant')
  })
})
