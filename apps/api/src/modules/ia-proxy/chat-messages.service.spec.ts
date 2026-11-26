/**
 * ⚠️⚠️ #2703 (22/09/2026) — CE FICHIER REVIENT SUR L'HYPOTHÈSE
 * « UN UTILISATEUR = UN ESPACE », DÉLIBÉRÉMENT.
 *
 * Elle était écrite noir sur blanc dans le service (« Identical behaviour today
 * (1 user = 1 workspace) ») et deux tests d'ici la GARDAIENT (`expect(where)
 * .not.toHaveProperty('user_id')`). Elle est morte chez un client payant :
 * Apricot Labs a deux sièges dans un même espace, et ses deux membres
 * écrivaient dans le même fil par défaut.
 *
 * CE QUI TIENT ENCORE, et que ce fichier continue de prouver :
 *  · `workspace_id` est dans CHAQUE lecture — un espace ne lit jamais le fil
 *    d'un autre (les espaces sont des ESN, donc des concurrents) ;
 *  · une conversation NOMMÉE reste une ressource d'ÉQUIPE : même clé qu'avant,
 *    tous les membres la lisent, l'archivent et la titrent ;
 *  · `user_id` reste l'attribution d'auteur écrite depuis le JWT, jamais depuis
 *    le corps de la requête (#1940.4 l'affiche, il ne l'invente pas).
 *
 * CE QUI A CHANGÉ : le fil par DÉFAUT (sans `conversation_id`) appartient à son
 * auteur — lecture, archivage, liste, titre et export. Le détail du contrat et
 * la reproduction de la collision à deux : `chat-thread-owner.spec.ts`.
 */
import { LessThan } from 'typeorm'
import { ChatMessagesService } from './chat-messages.service'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

describe('ChatMessagesService (workspace-scoped, multi-user Phase 2)', () => {
  let service: ChatMessagesService
  let repo: MockRepository<ChatMessageEntity>

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    // #1901.12 — `listHistory` coupe désormais dans une requête EXTÉRIEURE, posée
    // sur `manager.createQueryBuilder()` autour de la requête des fils. Le même
    // double chaînable sert les deux niveaux : les tests qui nourrissent
    // `_qb.getRawMany` lisent donc toujours la ligne rendue au service.
    Object.assign(repo._qb, {
      from: jest.fn().mockReturnValue(repo._qb),
      setParameters: jest.fn().mockReturnValue(repo._qb),
      getQuery: jest.fn().mockReturnValue('SELECT 1'),
      getParameters: jest.fn().mockReturnValue({}),
    })
    Object.assign(repo.manager, { createQueryBuilder: jest.fn().mockReturnValue(repo._qb) })
    service = new ChatMessagesService(repo as never)
  })

  describe('listThread', () => {
    // ⚠️ #2703 (22/09/2026) — CE TEST A BASCULÉ, délibérément. Il exigeait
    // l'inverse (« not.toHaveProperty('user_id') ») tant que « 1 utilisateur =
    // 1 espace » tenait. Apricot Labs paie deux sièges dans un même espace :
    // le fil par DÉFAUT est désormais PRIVÉ à son auteur. Le cloisonnement
    // d'espace, lui, ne bouge pas — `workspace_id` reste dans la clé.
    it('#2703 — le fil par défaut d’un compte est borné par l’espace ET par son auteur', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: 'a-1',
        conversationId: null,
        limit: 50,
      })
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspace_id: 'ws-1', account_id: 'a-1', user_id: 'u-1' }),
        }),
      )
    })

    it('scopes a conversation thread by workspace_id', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'conv-9',
        limit: 50,
      })
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace_id: 'ws-1', conversation_id: 'conv-9' } }),
      )
    })

    it('returns rows chronologically (reverses the DESC read)', async () => {
      const rows = [{ id: 'b' }, { id: 'a' }] as ChatMessageEntity[]
      repo.find.mockResolvedValueOnce(rows)
      const result = await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: 'a-1',
        conversationId: null,
        limit: 50,
      })
      expect(result.map(r => r.id)).toEqual(['a', 'b'])
    })

    // #1944.20 — le curseur de PAGINATION, distinct de `upTo` (version figée,
    // #2430.4). `before` ne rejoue jamais le message-frontière : strictement
    // AVANT, sinon la page suivante répéterait le dernier message de la page
    // précédente.
    describe('#1944.20 — before (pagination vers le haut)', () => {
      it('borne la lecture strictement AVANT le curseur', async () => {
        repo.find.mockResolvedValueOnce([])
        const before = new Date('2026-09-20T10:00:00.000Z')
        await service.listThread({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: 'a-1',
          conversationId: null,
          limit: 50,
          before,
        })
        expect(repo.find).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ created_at: LessThan(before) }),
          }),
        )
      })

      it('sans before, aucune borne de curseur (le fil vivant lit ses derniers messages)', async () => {
        repo.find.mockResolvedValueOnce([])
        await service.listThread({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: 'a-1',
          conversationId: null,
          limit: 50,
        })
        expect(repo.find).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ workspace_id: 'ws-1', account_id: 'a-1', user_id: 'u-1' }),
          }),
        )
        const where = (repo.find as jest.Mock).mock.calls[0][0].where
        expect(where).not.toHaveProperty('created_at')
      })
    })
  })

  describe('create', () => {
    it('stamps both user_id (created-by) and workspace_id (read scope)', async () => {
      repo.save.mockResolvedValueOnce({
        id: 'm-1',
        account_id: 'a-1',
        conversation_id: null,
        role: 'user',
        content: 'hi',
        created_at: new Date(),
      } as ChatMessageEntity)
      await service.create({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: 'a-1',
        conversationId: null,
        role: 'user',
        content: 'hi',
      })
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u-1', workspace_id: 'ws-1', account_id: 'a-1', content: 'hi' }),
      )
    })
  })

  /**
   * #1955.8 — « Un fil dupliqué apparaîtra comme un nouveau fil indépendant. »
   * Une copie de ses messages sous une clé NEUVE : rien de partagé avec
   * l'original derrière (l'archiver, le renommer ou le supprimer ensuite ne
   * touche pas l'autre), et rien n'écrit dans le fil d'origine.
   */
  describe('duplicateThread', () => {
    const SOURCE = {
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      conversationId: 'c-1',
    }

    it('sait dire NON : un fil introuvable dans cet espace ne se duplique pas', async () => {
      repo.find.mockResolvedValueOnce([])
      expect(await service.duplicateThread(SOURCE)).toBeNull()
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('copie chaque message sous une conversation_id NEUVE, jamais celle de la source', async () => {
      repo.find.mockResolvedValueOnce([
        {
          id: 'm-1',
          user_id: 'u-1',
          workspace_id: 'ws-1',
          account_id: 'a-1',
          conversation_id: 'c-1',
          role: 'user',
          content: 'Prépare la relance.',
          created_at: new Date('2026-09-10T09:00:00Z'),
        },
        {
          id: 'm-2',
          user_id: null,
          workspace_id: 'ws-1',
          account_id: 'a-1',
          conversation_id: 'c-1',
          role: 'assistant',
          content: 'Voici trois pistes.',
          created_at: new Date('2026-09-10T09:01:00Z'),
        },
      ] as ChatMessageEntity[])

      const result = await service.duplicateThread(SOURCE)

      expect(result).toMatchObject({ accountId: 'a-1', messages: 2 })
      expect(result?.conversationId).not.toBe('c-1')
      expect(repo.create).toHaveBeenCalledTimes(2)
      for (const call of repo.create.mock.calls) {
        expect(call[0]).toMatchObject({ workspace_id: 'ws-1', account_id: 'a-1' })
        expect(call[0].conversation_id).toBe(result?.conversationId)
      }
      // Le rôle et le contenu voyagent ; l'auteur HUMAIN aussi (qui a posé la
      // question reste vrai dans la copie), jamais celui d'une réponse de Laura.
      expect(repo.create.mock.calls[0]?.[0]).toMatchObject({
        role: 'user',
        content: 'Prépare la relance.',
        user_id: 'u-1',
      })
      expect(repo.create.mock.calls[1]?.[0]).toMatchObject({
        role: 'assistant',
        content: 'Voici trois pistes.',
        user_id: null,
      })
    })

    it('n’écrit rien dans le fil d’ORIGINE : aucun `update` ni `save` sur la clé source', async () => {
      repo.find.mockResolvedValueOnce([
        {
          id: 'm-1',
          user_id: 'u-1',
          workspace_id: 'ws-1',
          account_id: 'a-1',
          conversation_id: 'c-1',
          role: 'user',
          content: 'Question',
          created_at: new Date('2026-09-10T09:00:00Z'),
        },
      ] as ChatMessageEntity[])
      await service.duplicateThread(SOURCE)
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  describe('listHistory', () => {
    type StoredMessage = {
      id: string
      user_id: string | null
      account_id: string | null
      conversation_id: string | null
      content: string
      created_at: Date
    }
    const message = (row: {
      id: string
      conversation_id: string | null
      content: string
      at: string
    }): StoredMessage => ({
      id: row.id,
      user_id: null,
      account_id: null,
      conversation_id: row.conversation_id,
      content: row.content,
      created_at: new Date(row.at),
    })

    /**
     * #1901.12 — un double qui APPLIQUE la requête au lieu de rendre des lignes
     * déjà rangées : `DISTINCT ON` sur la clé de fil (sa première ligne), la
     * fenêtre `MAX(created_at)`, puis chaque ORDER BY et chaque LIMIT au NIVEAU
     * où il est posé — requête des fils, ou requête extérieure qui l'enveloppe.
     * Un double qui rend des lignes triées d'avance ne peut pas voir ce défaut :
     * ce qu'on teste, c'est l'ORDRE entre le tri et la coupe.
     *
     * Un tri sur une colonne que le double ne connaît pas le fait ÉCHOUER : il
     * ne peut pas ignorer une clause en silence.
     */
    function honourQuery(messages: StoredMessage[]): void {
      const threadKeyOf = (row: StoredMessage) => row.conversation_id ?? row.id
      const threads = () => {
        const byKey = new Map<string, StoredMessage[]>()
        for (const row of messages) byKey.set(threadKeyOf(row), [...(byKey.get(threadKeyOf(row)) ?? []), row])
        return [...byKey.values()].map(rows => {
          const ordered = [...rows].sort((left, right) => left.created_at.getTime() - right.created_at.getTime())
          return { ...ordered[0], last_message_at: ordered[ordered.length - 1].created_at }
        })
      }
      type Thread = ReturnType<typeof threads>[number]
      const valueOf = (row: Thread, expression: string): string | number => {
        if (expression.startsWith('COALESCE(')) return threadKeyOf(row)
        if (expression.endsWith('last_message_at')) return row.last_message_at.getTime()
        if (expression.endsWith('created_at')) return row.created_at.getTime()
        throw new Error(`Colonne de tri inconnue du double : ${expression}`)
      }
      const level = () => {
        let orders: [string, 'ASC' | 'DESC'][] = []
        let limit: number | undefined
        const apply = (rows: Thread[]) => {
          const sorted = [...rows].sort((left, right) => {
            for (const [expression, direction] of orders) {
              const a = valueOf(left, expression)
              const b = valueOf(right, expression)
              if (a !== b) return (a < b ? -1 : 1) * (direction === 'DESC' ? -1 : 1)
            }
            return 0
          })
          return limit === undefined ? sorted : sorted.slice(0, limit)
        }
        const builder: Record<string, jest.Mock> = {}
        for (const name of ['distinctOn', 'select', 'where', 'andWhere', 'from', 'setParameters']) {
          builder[name] = jest.fn(() => builder)
        }
        builder.orderBy = jest.fn((expression: string, direction: 'ASC' | 'DESC' = 'ASC') => {
          orders = [[expression, direction]]
          return builder
        })
        builder.addOrderBy = jest.fn((expression: string, direction: 'ASC' | 'DESC' = 'ASC') => {
          orders.push([expression, direction])
          return builder
        })
        builder.limit = jest.fn((count: number) => {
          limit = count
          return builder
        })
        builder.getQuery = jest.fn(() => '(requête des fils)')
        builder.getParameters = jest.fn(() => ({}))
        return { builder, apply }
      }
      const inner = level()
      const outer = level()
      inner.builder.getRawMany = jest.fn(async () => inner.apply(threads()))
      outer.builder.getRawMany = jest.fn(async () => outer.apply(inner.apply(threads())))
      repo.createQueryBuilder.mockReturnValue(inner.builder)
      Object.assign(repo.manager, { createQueryBuilder: jest.fn().mockReturnValue(outer.builder) })
    }

    it('scopes the history query by workspace_id', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([])
      await service.listHistory('ws-1', 'u-1', 25)
      expect(repo._qb.where).toHaveBeenCalledWith('message.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
    })

    // Régression prod : `conversation_id` est TEXT et `id` est UUID. Un
    // COALESCE des deux SANS cast est rejeté par Postgres (« types text and
    // uuid cannot be matched ») → l'endpoint /ia/chat/history rendait 500 à
    // chaque appel. Le DISTINCT ON et le premier ORDER BY doivent porter
    // l'expression castée, à l'identique.
    it('coalesce l’id en texte pour ne pas mélanger TEXT et UUID (fix du 500)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([])
      await service.listHistory('ws-1', 'u-1', 25)
      const coalesce = 'COALESCE(message.conversation_id, message.id::text)'
      expect(repo._qb.distinctOn).toHaveBeenCalledWith([coalesce])
      expect(repo._qb.orderBy).toHaveBeenCalledWith(coalesce, 'ASC')
    })

    // Un fil se NOMME par la question qui l'a ouvert : c'est le seul titre
    // stable quand un compte porte plusieurs fils (« Renouvellement TMA » vs
    // « Contacts DSI »). Titrer par le dernier message renommait le fil à
    // chaque échange — impossible de le retrouver dans la liste.
    it('titre le fil avec son PREMIER message, pas le dernier', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([])
      await service.listHistory('ws-1', 'u-1', 25)
      expect(repo._qb.addOrderBy).toHaveBeenCalledWith('message.created_at', 'ASC')
    })

    it('remonte la dernière activité de chaque fil (fenêtre MAX sur la partition)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([])
      await service.listHistory('ws-1', 'u-1', 25)
      const selected = repo._qb.select.mock.calls[0][0] as string[]
      expect(
        selected.some(column =>
          column.includes('MAX(message.created_at) OVER (PARTITION BY COALESCE(message.conversation_id'),
        ),
      ).toBe(true)
    })

    it('classe les fils par dernière activité, pas par date d’ouverture', async () => {
      honourQuery([
        message({ id: 'a1', conversation_id: 'c-ancien', content: 'Fil ouvert hier', at: '2026-07-20T09:00:00Z' }),
        message({ id: 'a2', conversation_id: 'c-ancien', content: 'suite', at: '2026-07-20T10:00:00Z' }),
        message({ id: 'b1', conversation_id: 'c-relance', content: 'Fil ouvert en juin', at: '2026-06-01T09:00:00Z' }),
        message({ id: 'b2', conversation_id: 'c-relance', content: 'relance', at: '2026-07-24T08:00:00Z' }),
      ])

      const items = await service.listHistory('ws-1', 'u-1', 25)

      expect(items.map(item => item.conversation_id)).toEqual(['c-relance', 'c-ancien'])
      expect(items[0].title).toBe('Fil ouvert en juin')
      expect(items[0].last_message_at).toEqual(new Date('2026-07-24T08:00:00Z'))
    })

    /**
     * #1901.12 — vérification 13/09. La requête faisait `DISTINCT ON (clé de fil)
     * ORDER BY clé ASC LIMIT 20`, puis triait par récence EN MÉMOIRE : la coupe
     * gardait les 20 plus PETITES clés (des UUID, donc un ordre sans rapport avec
     * le temps), et le tri n'arrivait qu'après. Au-delà de 20 fils, le fil qu'on
     * venait d'écrire pouvait ne jamais apparaître dans la colonne.
     *
     * Le plus récent a ici le plus PETIT identifiant de message, mais une clé de
     * fil (`conversation_id`) qui se range DERNIÈRE : c'est la seule clé que
     * `ORDER BY clé ASC LIMIT` sacrifie — et les quatre fils actifs juste avant
     * lui avec.
     */
    it('#1901.12 — sur 25 fils, la coupe à 20 garde les 20 plus RÉCENTS', async () => {
      const threads = Array.from({ length: 25 }, (_, index) => index)
      honourQuery(
        threads.map(index =>
          message({
            id: index === 24 ? '00000000-0000-4000-8000-000000000000' : `m-${String(index).padStart(2, '0')}`,
            conversation_id: index === 24 ? 'ffffffff-plus-recent' : `c-${String(index).padStart(2, '0')}`,
            content: `Question ${index}`,
            at: new Date(Date.UTC(2026, 8, 1, index)).toISOString(),
          }),
        ),
      )

      const items = await service.listHistory('ws-1', 'u-1', 20)

      expect(items).toHaveLength(20)
      expect(items[0]).toMatchObject({ conversation_id: 'ffffffff-plus-recent', title: 'Question 24' })
      expect(items.map(item => item.conversation_id)).toEqual([
        'ffffffff-plus-recent',
        ...threads
          .slice(5, 24)
          .reverse()
          .map(index => `c-${String(index).padStart(2, '0')}`),
      ])
    })

    it('#1901.12 — la dernière ACTIVITÉ décide, pas l’ouverture : un vieux fil relancé reste dans la coupe', async () => {
      honourQuery([
        ...Array.from({ length: 3 }, (_, index) =>
          message({
            id: `r-${index}`,
            conversation_id: `c-recent-${index}`,
            content: `Récent ${index}`,
            at: `2026-09-1${index}T09:00:00Z`,
          }),
        ),
        message({ id: 'v1', conversation_id: 'z-vieux', content: 'Ouvert en mars', at: '2026-03-01T09:00:00Z' }),
        message({ id: 'v2', conversation_id: 'z-vieux', content: 'Relancé ce matin', at: '2026-09-13T08:00:00Z' }),
      ])

      const items = await service.listHistory('ws-1', 'u-1', 2)

      expect(items.map(item => [item.conversation_id, item.title])).toEqual([
        ['z-vieux', 'Ouvert en mars'],
        ['c-recent-2', 'Récent 2'],
      ])
    })

    // #1911.10 — « Par compte » : l'intercalaire porte le NOM du compte. Le client
    // ne connaît que la première page de son portefeuille : un nom lu là-bas
    // manquerait pour tout compte au-delà, et l'écran n'a pas le droit de le
    // remplacer par un identifiant.
    describe('le nom du compte de chaque fil (#1911.10)', () => {
      const LAT = '0b9d6f0e-2f7a-4c6e-9d1a-6a1c2b3d4e01'
      const SAF = '0b9d6f0e-2f7a-4c6e-9d1a-6a1c2b3d4e02'
      const OTHER_WS = '0b9d6f0e-2f7a-4c6e-9d1a-6a1c2b3d4e03'
      const BLANK = '0b9d6f0e-2f7a-4c6e-9d1a-6a1c2b3d4e04'
      const accounts = [
        { id: LAT, workspace_id: 'ws-1', company_name: 'LATECOERE' },
        { id: SAF, workspace_id: 'ws-1', company_name: '  SAFRAN  ' },
        { id: OTHER_WS, workspace_id: 'ws-2', company_name: 'Concurrent' },
        { id: BLANK, workspace_id: 'ws-1', company_name: '   ' },
      ]
      const row = (id: string, accountId: string | null) => ({
        id,
        user_id: null,
        account_id: accountId,
        conversation_id: `c-${id}`,
        content: `Fil ${id}`,
        created_at: new Date('2026-09-12T09:00:00Z'),
        last_message_at: new Date('2026-09-12T09:00:00Z'),
      })
      /** La table `accounts`, bornée par les paramètres réellement liés. */
      const honourWorkspace = async (sql: string, params: unknown[] = []) => {
        if (!sql.includes('FROM accounts')) return []
        const [workspaceId, ids] = params as [string, string[]]
        return accounts
          .filter(account => account.workspace_id === workspaceId && ids.includes(account.id))
          .map(account => ({ id: account.id, companyName: account.company_name }))
      }

      it('chaque fil porte le nom de son compte, lu dans l’espace LU — jamais celui d’un autre', async () => {
        repo.manager.query.mockImplementation(honourWorkspace)
        repo._qb.getRawMany.mockResolvedValueOnce([
          row('a', LAT),
          row('b', SAF),
          row('c', OTHER_WS),
          row('d', BLANK),
          row('e', null),
          row('f', 'pas-un-uuid'),
        ])

        const items = await service.listHistory('ws-1', 'u-1', 25)

        expect(items.map(item => [item.conversation_id, item.account_name])).toEqual([
          ['c-a', 'LATECOERE'],
          ['c-b', 'SAFRAN'],
          // Un compte d'un AUTRE espace ne rend pas son nom, même par un message mal rangé.
          ['c-c', null],
          // Un nom blanc n'est pas un nom.
          ['c-d', null],
          ['c-e', null],
          ['c-f', null],
        ])
        const accountsCall = repo.manager.query.mock.calls.find(([sql]) => String(sql).includes('FROM accounts'))
        // Bornée par l'espace lu ; un identifiant qui n'est pas un uuid ne part pas
        // (il ferait échouer le cast de TOUTE la requête).
        expect(accountsCall?.[1]).toEqual(['ws-1', [LAT, SAF, OTHER_WS, BLANK]])
      })

      it('une lecture des comptes en panne rend quand même la liste, sans nom', async () => {
        repo.manager.query.mockImplementation(async (sql: string) => {
          if (sql.includes('FROM accounts')) throw new Error('boom')
          return []
        })
        repo._qb.getRawMany.mockResolvedValueOnce([row('a', LAT)])

        const items = await service.listHistory('ws-1', 'u-1', 25)

        expect(items).toEqual([expect.objectContaining({ conversation_id: 'c-a', account_name: null })])
      })

      it('n’attrape pas le voisin — aucun fil de compte, aucune lecture des comptes', async () => {
        repo.manager.query.mockImplementation(honourWorkspace)
        repo._qb.getRawMany.mockResolvedValueOnce([row('e', null)])

        await service.listHistory('ws-1', 'u-1', 25)

        expect(repo.manager.query.mock.calls.some(([sql]) => String(sql).includes('FROM accounts'))).toBe(false)
      })
    })

    it('retombe sur created_at quand la dernière activité manque', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a',
          account_id: null,
          conversation_id: 'c-1',
          content: 'Fil sans fenêtre',
          created_at: new Date('2026-07-20T09:00:00Z'),
          last_message_at: null,
        },
      ])

      const items = await service.listHistory('ws-1', 'u-1', 25)

      expect(items[0].last_message_at).toEqual(new Date('2026-07-20T09:00:00Z'))
    })

    /**
     * #1955.2 — « La recherche portera sur tout l'historique, pas seulement la
     * page chargée. » `filterThreads` (web) ne filtre que les fils déjà rendus
     * par `GET chat/history` (20 par défaut) ; `searchThreads` lit jusqu'à
     * `THREAD_SEARCH_SCAN_LIMIT` fils AVANT de filtrer, pour trouver un fil que
     * la page chargée n'aurait jamais montré.
     */
    describe('searchThreads', () => {
      it('scope la recherche par workspace_id, comme listHistory', async () => {
        repo._qb.getRawMany.mockResolvedValueOnce([])
        await service.searchThreads('ws-1', 'u-1', 'payfit', 20)
        expect(repo._qb.where).toHaveBeenCalledWith('message.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      })

      it('trouve un fil dont le TITRE contient le terme, insensible à la casse et aux accents', async () => {
        repo._qb.getRawMany.mockResolvedValueOnce([
          {
            id: 'a',
            user_id: null,
            account_id: null,
            conversation_id: 'c-1',
            content: 'Relance Latécoère',
            created_at: new Date('2026-09-10T09:00:00Z'),
            last_message_at: new Date('2026-09-10T09:00:00Z'),
          },
          {
            id: 'b',
            user_id: null,
            account_id: null,
            conversation_id: 'c-2',
            content: 'Sujet sans rapport',
            created_at: new Date('2026-09-11T09:00:00Z'),
            last_message_at: new Date('2026-09-11T09:00:00Z'),
          },
        ])

        const items = await service.searchThreads('ws-1', 'u-1', 'latecoere', 20)

        expect(items.map(item => item.conversation_id)).toEqual(['c-1'])
      })

      it('sait dire NON : une requête vide ne fait tomber personne — elle rend jusqu’à `limit`, pas une erreur', async () => {
        repo._qb.getRawMany.mockResolvedValueOnce([
          {
            id: 'a',
            user_id: null,
            account_id: null,
            conversation_id: 'c-1',
            content: 'N’importe quoi',
            created_at: new Date('2026-09-10T09:00:00Z'),
            last_message_at: new Date('2026-09-10T09:00:00Z'),
          },
        ])
        const items = await service.searchThreads('ws-1', 'u-1', '   ', 20)
        expect(items).toHaveLength(1)
      })

      it('trouve un fil au-delà des 20 premiers — la page que `GET chat/history` aurait chargée', async () => {
        const threads = Array.from({ length: 30 }, (_, index) => index)
        honourQuery(
          threads.map(index =>
            message({
              id: `m-${String(index).padStart(2, '0')}`,
              conversation_id: `c-${String(index).padStart(2, '0')}`,
              // Le fil le plus ANCIEN (donc au-delà d'une page de 20, classée
              // par récence) porte le terme cherché.
              content: index === 0 ? 'PAYFIT — renouvellement' : `Question ${index}`,
              at: new Date(Date.UTC(2026, 8, 1, index)).toISOString(),
            }),
          ),
        )

        const items = await service.searchThreads('ws-1', 'u-1', 'payfit', 20)

        expect(items.map(item => item.conversation_id)).toEqual(['c-00'])
      })

      it('respecte `limit` sur les résultats FILTRÉS, pas sur ce qui a été scanné', async () => {
        repo._qb.getRawMany.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, index) => ({
            id: `a-${index}`,
            user_id: null,
            account_id: null,
            conversation_id: `c-${index}`,
            content: 'Compte Helios',
            created_at: new Date(Date.UTC(2026, 8, 10, index)),
            last_message_at: new Date(Date.UTC(2026, 8, 10, index)),
          })),
        )
        const items = await service.searchThreads('ws-1', 'u-1', 'helios', 2)
        expect(items).toHaveLength(2)
      })
    })
  })

  // #1940.4 — « Comprendre qui a posé la question ». `chat_messages.user_id`
  // porte déjà l'auteur (écrit depuis le JWT par `create`) : aucune migration,
  // c'est la LECTURE qui manquait.
  describe('auteur des messages (#1940.4 / #1911.4)', () => {
    const members = [
      { user_id: 'u-theo', workspace_id: 'ws-1', first_name: 'Théo', avatar_url: null },
      { user_id: 'u-sarah', workspace_id: 'ws-2', first_name: 'Sarah', avatar_url: 'https://cdn.example.test/s.png' },
    ]
    /** La jointure membres × profils, bornée par les paramètres réellement liés. */
    const honourMembership = async (_sql: string, params: unknown[] = []) => {
      const [workspaceId, userIds] = params as [string, string[]]
      return members
        .filter(row => row.workspace_id === workspaceId && userIds.includes(row.user_id))
        .map(row => ({ userId: row.user_id, firstName: row.first_name, avatarUrl: row.avatar_url }))
    }

    it('chaque message utilisateur porte son auteur ; une réponse de Laura n’en porte aucun', async () => {
      repo.manager.query.mockImplementation(honourMembership)
      repo.find.mockResolvedValueOnce([
        { id: 'm-2', user_id: 'u-theo', role: 'assistant', content: 'Réponse' },
        { id: 'm-1', user_id: 'u-theo', role: 'user', content: 'Question' },
      ] as ChatMessageEntity[])

      const result = await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        limit: 50,
      })

      expect(result.map(message => [message.id, message.author])).toEqual([
        ['m-1', { firstName: 'Théo', avatarUrl: null }],
        ['m-2', null],
      ])
    })

    it('NON — un auteur membre d’un AUTRE espace ne rend ni prénom ni avatar', async () => {
      repo.manager.query.mockImplementation(honourMembership)
      repo.find.mockResolvedValueOnce([
        { id: 'm-1', user_id: 'u-sarah', role: 'user', content: 'Q' },
      ] as ChatMessageEntity[])

      const [message] = await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        limit: 50,
      })

      expect(message?.author).toBeNull()
      // La résolution est bornée par l'espace LU, jamais par celui de l'auteur.
      expect(repo.manager.query).toHaveBeenCalledWith(expect.any(String), ['ws-1', ['u-sarah']])
    })

    it('un message dont le compte a été effacé (`user_id` null) garde son texte, sans auteur', async () => {
      repo.manager.query.mockImplementation(honourMembership)
      repo.find.mockResolvedValueOnce([
        { id: 'm-1', user_id: null, role: 'user', content: 'Texte gardé' },
      ] as unknown as ChatMessageEntity[])

      const [message] = await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        limit: 50,
      })

      expect(message).toMatchObject({ content: 'Texte gardé', author: null })
    })

    it('ne sert jamais `user_id` au client — l’auteur est un prénom, pas un identifiant', async () => {
      repo.manager.query.mockImplementation(honourMembership)
      repo.find.mockResolvedValueOnce([
        { id: 'm-1', user_id: 'u-theo', role: 'user', content: 'Q' },
      ] as ChatMessageEntity[])

      const [message] = await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        limit: 50,
      })

      expect(message).not.toHaveProperty('user_id')
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ select: expect.arrayContaining(['user_id']) }))
    })

    it('une résolution d’auteur en panne rend quand même le fil', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      repo.find.mockResolvedValueOnce([
        { id: 'm-1', user_id: 'u-theo', role: 'user', content: 'Q' },
      ] as ChatMessageEntity[])

      const result = await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        limit: 50,
      })

      expect(result).toEqual([expect.objectContaining({ id: 'm-1', author: null })])
    })

    it('#1911.4 — la liste des fils nomme son auteur principal : celui qui a OUVERT le fil', async () => {
      repo.manager.query.mockImplementation(honourMembership)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a',
          user_id: 'u-theo',
          account_id: null,
          conversation_id: 'c-1',
          content: 'Question qui ouvre le fil',
          created_at: new Date('2026-09-12T09:00:00Z'),
          last_message_at: new Date('2026-09-12T10:00:00Z'),
        },
        {
          id: 'b',
          user_id: null,
          account_id: null,
          conversation_id: 'c-2',
          content: 'Fil d’un compte effacé',
          created_at: new Date('2026-09-11T09:00:00Z'),
          last_message_at: new Date('2026-09-11T09:00:00Z'),
        },
      ])

      const items = await service.listHistory('ws-1', 'u-1', 25)

      // La ligne gardée par DISTINCT ON est le PREMIER message utilisateur du fil :
      // son `user_id` est donc celui du créateur.
      expect(repo._qb.select.mock.calls[0][0]).toEqual(expect.arrayContaining(['message.user_id AS user_id']))
      expect(items.map(item => [item.conversation_id, item.author])).toEqual([
        ['c-1', { firstName: 'Théo', avatarUrl: null }],
        ['c-2', null],
      ])
      expect(items[0]).not.toHaveProperty('user_id')
    })
  })

  // Proof the scope switch is behaviour-preserving today AND excludes other
  // tenants: a repo that honours the `where` clause returns exactly the rows a
  // former `where user_id` scoping did (1 user = 1 workspace, backfilled 1:1).
  it('a workspace read returns the same rows as the former user scope, excluding other tenants', async () => {
    const rows = [
      { id: 'a', user_id: 'u1', workspace_id: 'w1', account_id: 'acc', conversation_id: null },
      { id: 'b', user_id: 'u1', workspace_id: 'w1', account_id: 'acc', conversation_id: null },
      { id: 'c', user_id: 'u2', workspace_id: 'w2', account_id: 'acc', conversation_id: null },
    ] as unknown as ChatMessageEntity[]
    const fakeFind = jest.fn(async (opts: { where: Record<string, unknown> }) =>
      rows.filter(r => (r as unknown as Record<string, unknown>)['workspace_id'] === opts.where['workspace_id']),
    )
    const svc = new ChatMessagesService({ find: fakeFind } as never)

    const result = await svc.listThread({
      userId: 'u-1',
      workspaceId: 'w1',
      accountId: 'acc',
      conversationId: null,
      limit: 50,
    })
    expect(result.map(r => r.id).sort()).toEqual(['a', 'b'])
    expect(result.some(r => r.id === 'c')).toBe(false) // other tenant excluded
  })

  // #1911.1 / #1911.12 — les trois lectures du titre d'un fil. Toutes passent
  // par `threadWhere` : la MÊME désignation que l'archivage, bornée à l'espace.
  describe('lectures du titre d’un fil (#1911.1)', () => {
    const conversation = { userId: 'u-1', workspaceId: 'ws-1', accountId: null, conversationId: 'c-1' }

    it('threadExists — un fil existe dans CET espace s’il y porte au moins un message', async () => {
      repo.count.mockResolvedValueOnce(3)
      await expect(service.threadExists(conversation)).resolves.toBe(true)
      expect(repo.count).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', conversation_id: 'c-1' } })
    })

    it('threadExists — sait dire NON : zéro message dans cet espace, pas de fil', async () => {
      repo.count.mockResolvedValueOnce(0)
      await expect(service.threadExists(conversation)).resolves.toBe(false)
    })

    it('exchangeCounts — compte les questions et les réponses du fil, jamais d’un autre espace', async () => {
      repo.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3)
      await expect(service.exchangeCounts(conversation)).resolves.toEqual({ user: 2, assistant: 3 })
      expect(repo.count).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', conversation_id: 'c-1', role: 'user' } })
      expect(repo.count).toHaveBeenCalledWith({
        where: { workspace_id: 'ws-1', conversation_id: 'c-1', role: 'assistant' },
      })
    })

    it('threadOpening — l’OUVERTURE du fil, dans l’ordre, bornée', async () => {
      repo.find.mockResolvedValueOnce([
        { role: 'user', content: 'Prépare le RDV SNCF' },
        { role: 'assistant', content: 'Voici trois points.' },
      ])
      await expect(
        service.threadOpening({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1', conversationId: null }, 6),
      ).resolves.toEqual([
        { role: 'user', content: 'Prépare le RDV SNCF' },
        { role: 'assistant', content: 'Voici trois points.' },
      ])
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspace_id: 'ws-1', account_id: 'a-1' }),
          select: ['role', 'content'],
          order: { created_at: 'ASC' },
          take: 6,
        }),
      )
    })
  })

  /**
   * #1911.15 — QUI a OUVERT ce fil, le repère qu'utilise le contrôleur pour
   * décider qui peut le SUPPRIMER (l'auteur, ou un gérant de l'espace). Même
   * clé que `threadExists`/`threadOpening` (`threadWhere`, bornée à l'espace),
   * même définition d'auteur que `listHistory` (#1911.4) : le PREMIER message
   * 'user' du fil.
   */
  describe('threadAuthor (#1911.15)', () => {
    const conversation = { userId: 'u-1', workspaceId: 'ws-1', accountId: null, conversationId: 'c-1' }

    it('rend le user_id du PREMIER message utilisateur du fil, borné à cet espace', async () => {
      repo.findOne.mockResolvedValueOnce({ user_id: 'u-opener' } as ChatMessageEntity)
      await expect(service.threadAuthor(conversation)).resolves.toBe('u-opener')
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { workspace_id: 'ws-1', conversation_id: 'c-1', role: 'user' },
        select: ['user_id'],
        order: { created_at: 'ASC' },
      })
    })

    it('sait dire NON : aucun message dans cet espace, aucun auteur', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      await expect(service.threadAuthor(conversation)).resolves.toBeNull()
    })

    it('un compte supprimé (user_id NULL sur le premier message) rend null, pas une erreur', async () => {
      repo.findOne.mockResolvedValueOnce({ user_id: null } as unknown as ChatMessageEntity)
      await expect(service.threadAuthor(conversation)).resolves.toBeNull()
    })
  })

  /**
   * #1957.8 — les HORODATAGES du plafond : de quoi calculer l'instant où il se
   * rouvre, sur la fenêtre glissante réelle.
   */
  describe('userMessageStampsSince (#1957.8)', () => {
    it('lit les demandes de CET utilisateur, dans l’ordre, avec leur exonération', async () => {
      const first = new Date('2026-09-12T13:00:00.000Z')
      const second = new Date('2026-09-12T15:00:00.000Z')
      repo.find.mockResolvedValueOnce([
        { created_at: first, quota_exempt_at: null },
        { created_at: second, quota_exempt_at: new Date('2026-09-12T15:00:01.000Z') },
      ] as ChatMessageEntity[])

      await expect(service.userMessageStampsSince('u-1', new Date('2026-09-12T12:00:00.000Z'))).resolves.toEqual([
        { at: first, exempt: false },
        { at: second, exempt: true },
      ])
      const args = repo.find.mock.calls[0][0] as {
        where: Record<string, unknown>
        order: Record<string, unknown>
        select: string[]
      }
      // Cloisonné au SIÈGE, comme le comptage : jamais l'espace entier.
      expect(args.where).toMatchObject({ user_id: 'u-1', role: 'user' })
      expect(args.where).not.toHaveProperty('workspace_id')
      expect(args.where.created_at).toBeDefined()
      expect(args.order).toEqual({ created_at: 'ASC' })
      expect(args.select).toEqual(['created_at', 'quota_exempt_at'])
    })

    it('une lecture TRONQUÉE rend null — un instant calculé sur une partie serait faux', async () => {
      repo.find.mockImplementationOnce(async (args: { take: number }) =>
        Array.from({ length: args.take }, () => ({ created_at: new Date(), quota_exempt_at: null })),
      )

      await expect(service.userMessageStampsSince('u-1', new Date())).resolves.toBeNull()
    })
  })
})
