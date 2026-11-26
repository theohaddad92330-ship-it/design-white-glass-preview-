import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { TeamCommentEntity } from '../../database/entities/team-comment.entity'
import type { ChatConversationEntity } from '../../database/entities/chat-conversation.entity'
import type { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { TeamCommentsService } from './team-comments.service'

describe('TeamCommentsService', () => {
  let repo: MockRepository<TeamCommentEntity>
  let conversations: MockRepository<ChatConversationEntity>
  let accounts: MockRepository<AccountEntity>
  let workspaceContext: {
    resolveActiveWorkspace: jest.Mock
    assertMember: jest.Mock
    portfolioVisibilityOf: jest.Mock
    listMembers: jest.Mock
  }
  let service: TeamCommentsService

  beforeEach(() => {
    repo = createMockRepository<TeamCommentEntity>()
    conversations = createMockRepository<ChatConversationEntity>()
    accounts = createMockRepository<AccountEntity>()
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      assertMember: jest.fn().mockResolvedValue({}),
      portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      listMembers: jest.fn().mockResolvedValue([
        { userId: 'u1', email: 'u1@esn.fr', fullName: 'U1', role: 'owner', isSelf: true },
        { userId: 'u2', email: 'u2@esn.fr', fullName: 'U2', role: 'sales', isSelf: false },
      ]),
    }
    service = new TeamCommentsService(
      repo as never,
      conversations as never,
      accounts as never,
      workspaceContext as unknown as WorkspaceContextService,
    )
  })

  describe('list', () => {
    it('scopes to the workspace, newest first, excludes conversation-scoped comments, resolving author + account', async () => {
      repo.manager.query.mockResolvedValue([
        {
          id: 'c-1',
          workspaceId: 'ws-1',
          authorUserId: 'u1',
          firstName: 'Alice',
          lastName: 'Martin',
          email: 'alice@esn.fr',
          body: 'Attention, ce compte a déjà été démarché.',
          accountId: 'acc-1',
          companyName: 'Decathlon',
          conversationId: null,
          messageId: null,
          createdAt: '2026-07-22T08:30:00.000Z',
        },
      ])

      const result = await service.list('u1')

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1', 50])
      expect(sql).toContain('WHERE c.workspace_id = $1')
      // #1940.6 — le fil général du cockpit n'affiche jamais un commentaire de conversation.
      expect(sql).toContain('c.conversation_id IS NULL')
      expect(sql).toContain('ORDER BY c.created_at DESC')
      expect(result[0]).toEqual({
        id: 'c-1',
        workspace_id: 'ws-1',
        author_user_id: 'u1',
        author_name: 'Alice Martin',
        body: 'Attention, ce compte a déjà été démarché.',
        account_id: 'acc-1',
        company_name: 'Decathlon',
        conversation_id: null,
        message_id: null,
        mentioned_user_ids: [],
        parent_comment_id: null,
        resolved_at: null,
        resolved_by: null,
        created_at: '2026-07-22T08:30:00.000Z',
      })
    })

    it('#1940.6 — lists a thread’s comments oldest-first when asked, never excluded', async () => {
      repo.manager.query.mockResolvedValue([
        {
          id: 'c-2',
          workspaceId: 'ws-1',
          authorUserId: 'u2',
          firstName: 'Bob',
          lastName: null,
          email: 'bob@esn.fr',
          body: 'Vu, je relance demain.',
          accountId: null,
          companyName: null,
          conversationId: 'conv-1',
          messageId: 'm-1',
          createdAt: '2026-09-22T10:00:00.000Z',
        },
      ])

      const result = await service.list('u1', 'conv-1')

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1', 'conv-1'])
      expect(sql).toContain('c.conversation_id = $2')
      expect(sql).toContain('ORDER BY c.created_at ASC')
      expect(result[0].conversation_id).toBe('conv-1')
      expect(result[0].message_id).toBe('m-1')
    })

    it('#1940.6 — refuses a thread whose cited account is outside the caller’s portfolio', async () => {
      // `owner` porte `team:manage` (voit tout, `portfolioScopeFor` rend `null`) —
      // un rôle commercial ordinaire est ce que le cloisonnement borne.
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      conversations.findOne.mockResolvedValue({
        workspace_id: 'ws-1',
        conversation_id: 'conv-1',
        attached_account_id: 'acc-9',
      })
      accounts.findOne.mockResolvedValue({ id: 'acc-9', assigned_to: 'colleague-2' })

      await expect(service.list('u1', 'conv-1')).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.manager.query).not.toHaveBeenCalled()
    })

    it('#1940.6 — a thread with no attached account, or one the caller owns, is readable', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      conversations.findOne.mockResolvedValue(null) // fil par défaut, sans ligne chat_conversations
      repo.manager.query.mockResolvedValue([])

      await expect(service.list('u1', 'conv-1')).resolves.toEqual([])
    })

    // #2914 (#2128.10) — LE FIL DE COMMENTAIRES D'UN COMPTE. `account_id`
    // était déjà écrit par `create` (facultatif) et rendu par `toWire`, mais
    // AUCUNE lecture ne permettait de retrouver « les commentaires de CE
    // compte » : ils se noyaient dans le fil général de l'espace (`GET
    // /team-comments` sans paramètre), invisibles depuis la fiche compte.
    // Même patron que le fil de conversation (#1940.6) juste au-dessus :
    // chronologique (le plus ancien d'abord), et le même contrôle d'accès
    // portefeuille — commenter un compte qu'on ne pourrait pas ouvrir soi-même
    // reste refusé.
    describe('scoped to one account (#2914, #2128.10)', () => {
      it('lists the account’s thread, oldest first, filtered on account_id', async () => {
        repo.manager.query.mockResolvedValue([
          {
            id: 'c-3',
            workspaceId: 'ws-1',
            authorUserId: 'u2',
            firstName: 'Bob',
            lastName: null,
            email: 'bob@esn.fr',
            body: 'Ce compte a un DPO très pointilleux, prévenir avant tout envoi.',
            accountId: 'acc-1',
            companyName: 'Decathlon',
            conversationId: null,
            messageId: null,
            createdAt: '2026-09-24T09:00:00.000Z',
          },
        ])
        accounts.findOne.mockResolvedValue({ id: 'acc-1', assigned_to: null })

        const result = await service.list('u1', undefined, 'acc-1')

        const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
        expect(params).toEqual(['ws-1', 'acc-1'])
        expect(sql).toContain('c.account_id = $2')
        expect(sql).toContain('ORDER BY c.created_at ASC')
        expect(result[0].account_id).toBe('acc-1')
      })

      it('a target account outside the caller’s portfolio is refused, never listed', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
        workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
        accounts.findOne.mockResolvedValue({ id: 'acc-9', assigned_to: 'colleague-2' })

        await expect(service.list('u1', undefined, 'acc-9')).rejects.toBeInstanceOf(ForbiddenException)
        expect(repo.manager.query).not.toHaveBeenCalled()
      })

      it('#4996 L3 — un co-équipier actif du compte porté par un autre l’ouvre, même cloisonné', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
        workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
        accounts.findOne.mockResolvedValue({ id: 'acc-9', assigned_to: 'colleague-2' })
        accounts.manager.query.mockResolvedValue([{ account_id: 'acc-9' }])
        repo.manager.query.mockResolvedValue([])

        await expect(service.list('u1', undefined, 'acc-9')).resolves.toEqual([])
      })

      it('#4996 L3 — un non-membre (équipe vide) d’un compte porté est refusé', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
        workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
        accounts.findOne.mockResolvedValue({ id: 'acc-9', assigned_to: 'colleague-2' })
        accounts.manager.query.mockResolvedValue([])

        await expect(service.list('u1', undefined, 'acc-9')).rejects.toBeInstanceOf(ForbiddenException)
      })

      it('an unknown account id is a 404, never a silent empty thread', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
        workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
        accounts.findOne.mockResolvedValue(null)

        await expect(service.list('u1', undefined, 'ghost')).rejects.toBeInstanceOf(NotFoundException)
      })

      it('open portfolio (team:manage) never gates a target account', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' })
        repo.manager.query.mockResolvedValue([])

        await expect(service.list('u1', undefined, 'acc-1')).resolves.toEqual([])
        expect(accounts.findOne).not.toHaveBeenCalled()
      })
    })
  })

  describe('create', () => {
    it('proves membership, persists the comment and returns it resolved', async () => {
      repo.save.mockResolvedValue({ id: 'c-9' } as TeamCommentEntity)
      repo.manager.query.mockResolvedValue([
        {
          id: 'c-9',
          workspaceId: 'ws-1',
          authorUserId: 'u1',
          firstName: null,
          lastName: null,
          email: 'bob@esn.fr',
          body: 'Idée : mutualiser la soutenance.',
          accountId: null,
          companyName: null,
          conversationId: null,
          messageId: null,
          createdAt: '2026-07-23T09:00:00.000Z',
        },
      ])

      const result = await service.create('u1', { body: 'Idée : mutualiser la soutenance.' })

      expect(workspaceContext.assertMember).toHaveBeenCalledWith('u1', 'ws-1')
      const created = repo.create.mock.calls[0][0] as Partial<TeamCommentEntity>
      expect(created).toMatchObject({ workspace_id: 'ws-1', author_user_id: 'u1', account_id: null })
      // No name on the profile → falls back to the email local part, never invented.
      expect(result.author_name).toBe('bob')
    })

    it('rejects an account target from another workspace (404, no cross-team link)', async () => {
      repo.manager.query.mockResolvedValue([]) // account not found in this workspace
      await expect(
        service.create('u1', { body: 'note', account_id: '11111111-1111-1111-1111-111111111111' }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('#1940.6 — comments a thread reachable by the caller, storing conversation_id + message_id', async () => {
      repo.save.mockResolvedValue({ id: 'c-10' } as TeamCommentEntity)
      repo.manager.query.mockResolvedValue([
        {
          id: 'c-10',
          workspaceId: 'ws-1',
          authorUserId: 'u1',
          firstName: 'Alice',
          lastName: null,
          email: 'alice@esn.fr',
          body: 'Bien vu.',
          accountId: null,
          companyName: null,
          conversationId: 'conv-1',
          messageId: 'm-1',
          createdAt: '2026-09-23T09:00:00.000Z',
        },
      ])

      const result = await service.create('u1', { body: 'Bien vu.', conversation_id: 'conv-1', message_id: 'm-1' })

      const created = repo.create.mock.calls[0][0] as Partial<TeamCommentEntity>
      expect(created).toMatchObject({ conversation_id: 'conv-1', message_id: 'm-1' })
      expect(result.conversation_id).toBe('conv-1')
      expect(result.message_id).toBe('m-1')
    })

    it('#1940.6 — refuses to comment a thread whose cited account is outside the caller’s portfolio', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      conversations.findOne.mockResolvedValue({
        workspace_id: 'ws-1',
        conversation_id: 'conv-1',
        attached_account_id: 'acc-9',
      })
      accounts.findOne.mockResolvedValue({ id: 'acc-9', assigned_to: 'colleague-2' })

      await expect(service.create('u1', { body: 'note', conversation_id: 'conv-1' })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(repo.save).not.toHaveBeenCalled()
    })

    // #2914 (#2128.9) — mentionner un collègue. Aucune écriture n'est jamais
    // « visée dans le vide » : un id mentionné est re-vérifié comme membre de
    // l'espace AVANT la sauvegarde, jamais retenu tel quel.
    describe('mentions (#2914, #2128.9)', () => {
      it('persists mentioned colleagues proven members of the workspace', async () => {
        repo.save.mockResolvedValue({ id: 'c-11' } as TeamCommentEntity)
        repo.manager.query.mockResolvedValue([
          {
            id: 'c-11',
            workspaceId: 'ws-1',
            authorUserId: 'u1',
            firstName: null,
            lastName: null,
            email: 'u1@esn.fr',
            body: '@u2 tu peux relancer ?',
            accountId: null,
            companyName: null,
            conversationId: null,
            messageId: null,
            mentionedUserIds: ['u2'],
            createdAt: '2026-09-25T09:00:00.000Z',
          },
        ])

        const result = await service.create('u1', { body: '@u2 tu peux relancer ?', mentioned_user_ids: ['u2'] })

        expect(workspaceContext.listMembers).toHaveBeenCalledWith('u1')
        const created = repo.create.mock.calls[0][0] as Partial<TeamCommentEntity>
        expect(created.mentioned_user_ids).toEqual(['u2'])
        expect(result.mentioned_user_ids).toEqual(['u2'])
      })

      it('rejects a mentioned id that is not a member of the workspace — never recorded silently', async () => {
        await expect(service.create('u1', { body: 'note', mentioned_user_ids: ['ghost-id'] })).rejects.toBeInstanceOf(
          NotFoundException,
        )
        expect(repo.save).not.toHaveBeenCalled()
      })

      // #4158.17 — la mention produit une notification, via le service d'équipe.
      describe('notification des mentionnés (#4158.17)', () => {
        let notify: { notifyMentions: jest.Mock }
        beforeEach(() => {
          notify = { notifyMentions: jest.fn().mockResolvedValue(undefined) }
          service = new TeamCommentsService(
            repo as never,
            conversations as never,
            accounts as never,
            workspaceContext as unknown as WorkspaceContextService,
            notify as never,
          )
          repo.save.mockResolvedValue({ id: 'c-20', created_at: new Date('2026-10-14T09:00:00Z') } as TeamCommentEntity)
          repo.manager.query.mockResolvedValue([])
        })

        it('prévient les mentionnés, dans l’espace actif, avec la cible du commentaire', async () => {
          await service.create('u1', { body: '@u2 regarde', mentioned_user_ids: ['u2'] })
          expect(notify.notifyMentions).toHaveBeenCalledWith({
            workspaceId: 'ws-1',
            actorUserId: 'u1',
            mentionedUserIds: ['u2'],
            accountId: null,
            conversationId: null,
          })
        })

        it('sans mention, aucun appel', async () => {
          await service.create('u1', { body: 'note' })
          expect(notify.notifyMentions).not.toHaveBeenCalled()
        })

        it('une mention REFUSÉE (id hors espace) n’écrit rien et ne prévient personne', async () => {
          await expect(service.create('u1', { body: 'x', mentioned_user_ids: ['ghost'] })).rejects.toBeInstanceOf(
            NotFoundException,
          )
          expect(notify.notifyMentions).not.toHaveBeenCalled()
        })
      })

      it('no mentions given → stored as an empty array, never null', async () => {
        repo.save.mockResolvedValue({ id: 'c-12' } as TeamCommentEntity)
        repo.manager.query.mockResolvedValue([
          {
            id: 'c-12',
            workspaceId: 'ws-1',
            authorUserId: 'u1',
            firstName: null,
            lastName: null,
            email: 'u1@esn.fr',
            body: 'note',
            accountId: null,
            companyName: null,
            conversationId: null,
            messageId: null,
            mentionedUserIds: [],
            createdAt: '2026-09-25T09:00:00.000Z',
          },
        ])

        await service.create('u1', { body: 'note' })

        const created = repo.create.mock.calls[0][0] as Partial<TeamCommentEntity>
        expect(created.mentioned_user_ids).toEqual([])
      })
    })
  })

  // #4158.31 — fils d'équipe : « résolu » et « mes fils ouverts », bornés à l'espace actif.
  describe('#4158.31 — fils résolus et « mes fils ouverts »', () => {
    const root = (over: Record<string, unknown> = {}) => ({
      id: 'c-root',
      workspaceId: 'ws-1',
      authorUserId: 'u1',
      firstName: 'Alice',
      lastName: null,
      email: 'a@esn.fr',
      body: 'À arbitrer',
      accountId: null,
      companyName: null,
      conversationId: null,
      messageId: null,
      mentionedUserIds: [],
      parentCommentId: null,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: '2026-10-14T08:00:00.000Z',
      ...over,
    })
    const ROOT_ID = '11111111-1111-4111-8111-111111111111'

    it('« mes fils ouverts » : racines non résolues, auteur/mentionné/intervenu, bornées à l’espace', async () => {
      repo.manager.query.mockResolvedValue([root()])

      const result = await service.list('u1', undefined, undefined, true)

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1', 'u1', 50])
      expect(sql).toContain('c.workspace_id = $1')
      expect(sql).toContain('c.parent_comment_id IS NULL AND c.resolved_at IS NULL')
      expect(sql).toContain('ANY(c.mentioned_user_ids)')
      expect(result).toHaveLength(1)
    })

    it('résout la racine d’un fil et enregistre qui l’a fait', async () => {
      repo.manager.query
        .mockResolvedValueOnce([root({ id: ROOT_ID })]) // lecture
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([root({ id: ROOT_ID, resolvedAt: '2026-10-14T09:00:00.000Z', resolvedBy: 'u1' })])

      const result = await service.setResolution('u1', ROOT_ID, true)

      const [updateSql, updateParams] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(updateSql).toContain('resolved_at = now()')
      expect(updateSql).toContain('workspace_id = $2')
      expect(updateParams).toEqual([ROOT_ID, 'ws-1', 'u1'])
      expect(result.resolved_at).toBe('2026-10-14T09:00:00.000Z')
      expect(result.resolved_by).toBe('u1')
    })

    it('rouvrir efface la marque — rien n’est supprimé', async () => {
      repo.manager.query
        .mockResolvedValueOnce([root({ id: ROOT_ID, resolvedAt: '2026-10-14T09:00:00.000Z', resolvedBy: 'u1' })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([root({ id: ROOT_ID })])

      const result = await service.setResolution('u1', ROOT_ID, false)

      const [updateSql, updateParams] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(updateSql).toContain('resolved_at = NULL')
      expect(updateParams).toEqual([ROOT_ID, 'ws-1', null])
      expect(result.resolved_at).toBeNull()
    })

    it('un fil d’un AUTRE espace est un 404 — jamais résolu', async () => {
      repo.manager.query.mockResolvedValueOnce([]) // la lecture est bornée à l'espace actif

      await expect(service.setResolution('u1', ROOT_ID, true)).rejects.toBeInstanceOf(NotFoundException)
      expect(repo.manager.query).toHaveBeenCalledTimes(1)
      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual([ROOT_ID, 'ws-1'])
    })

    it('refuse de résoudre une réponse : on résout le fil, pas un message', async () => {
      repo.manager.query.mockResolvedValueOnce([root({ id: ROOT_ID, parentCommentId: 'c-parent' })])

      await expect(service.setResolution('u1', ROOT_ID, true)).rejects.toBeInstanceOf(BadRequestException)
      expect(repo.manager.query).toHaveBeenCalledTimes(1)
    })

    it('un compte hors du portefeuille du lecteur n’ouvre pas son fil à la résolution', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      accounts.findOne.mockResolvedValue({ id: 'acc-9', workspace_id: 'ws-1', assigned_to: 'autre' })
      repo.manager.query.mockResolvedValueOnce([root({ id: ROOT_ID, accountId: 'acc-9' })])

      await expect(service.setResolution('u1', ROOT_ID, true)).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.manager.query).toHaveBeenCalledTimes(1)
    })

    it('répondre rattache la réponse à la RACINE du fil et hérite de sa cible', async () => {
      const reply = '22222222-2222-4222-8222-222222222222'
      repo.manager.query
        .mockResolvedValueOnce([{ id: reply, parent: ROOT_ID, account_id: null, conversation_id: null }])
        .mockResolvedValueOnce([root({ id: 'new', parentCommentId: ROOT_ID })])
      repo.create.mockImplementation((v: unknown) => v as never)
      repo.save.mockImplementation(async (v: unknown) => ({ id: 'new', ...(v as object) }) as never)

      const result = await service.create('u1', { body: 'Je prends', parent_comment_id: reply })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ parent_comment_id: ROOT_ID }))
      expect(result.parent_comment_id).toBe(ROOT_ID)
    })

    it('répondre à un fil d’un autre espace est un 404', async () => {
      repo.manager.query.mockResolvedValueOnce([])

      await expect(
        service.create('u1', { body: 'Intrus', parent_comment_id: '33333333-3333-4333-8333-333333333333' }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(repo.save).not.toHaveBeenCalled()
    })
  })
})
