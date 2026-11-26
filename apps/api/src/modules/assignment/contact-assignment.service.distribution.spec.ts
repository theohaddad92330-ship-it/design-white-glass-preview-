import { IsNull } from 'typeorm'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ContactAssignmentService } from './contact-assignment.service'

/** #4996 L5 — pré-assignation : aperçu figé, apply seulement sur `assigned_to IS NULL`. */
describe('ContactAssignmentService — distribute (#4996 L5)', () => {
  let contacts: { find: jest.Mock; update: jest.Mock; findOne: jest.Mock }
  let accounts: { findOne: jest.Mock }
  let scopes: { find: jest.Mock }
  let teamMembers: { find: jest.Mock }
  let workspaceContext: {
    resolveActiveWorkspace: jest.Mock
    getMembership: jest.Mock
    isDemoWorkspace: jest.Mock
    listMembers: jest.Mock
  }
  let service: ContactAssignmentService

  const contact = (id: string, entity_id: string | null, assigned_to: string | null = null) => ({
    id,
    entity_id,
    assigned_to,
  })
  const scope = (user_id: string, entity_id: string | null, label = 'CIB') => ({ user_id, entity_id, label })

  beforeEach(() => {
    contacts = {
      find: jest.fn().mockResolvedValue([contact('c1', 'e1'), contact('c2', 'e2'), contact('c3', null)]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    accounts = { findOne: jest.fn().mockResolvedValue({ id: 'a1', workspace_id: 'ws-1', assigned_to: 'u-resp' }) }
    scopes = { find: jest.fn().mockResolvedValue([scope('u-lea', 'e1', 'CIB'), scope('u-claire', 'e2', 'PF')]) }
    teamMembers = { find: jest.fn().mockResolvedValue([{ user_id: 'u-lea' }, { user_id: 'u-claire' }]) }
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
      getMembership: jest.fn(),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
      listMembers: jest.fn().mockResolvedValue([
        { userId: 'u-lea', fullName: 'Léa M.', email: null },
        { userId: 'u-claire', fullName: 'Claire D.', email: null },
        { userId: 'u-resp', fullName: 'Resp', email: null },
      ]),
    }
    service = new ContactAssignmentService(
      contacts as never,
      workspaceContext as unknown as WorkspaceContextService,
      accounts as never,
      scopes as never,
      teamMembers as never,
    )
  })

  describe('preview', () => {
    it('groups free contacts by their single covering member and counts the rest as unchanged', async () => {
      const out = await service.distributePreview('u-resp', 'a1')

      expect(out.groups).toEqual([
        { user_id: 'u-claire', name: 'Claire D.', labels: ['PF'], count: 1 },
        { user_id: 'u-lea', name: 'Léa M.', labels: ['CIB'], count: 1 },
      ])
      expect(out.unchanged_count).toBe(1)
      expect(out.fingerprint).toMatch(/^[0-9a-f]{64}$/)
      expect(contacts.update).not.toHaveBeenCalled()
    })

    it('leaves a contact covered by two members unchanged', async () => {
      scopes.find.mockResolvedValue([scope('u-lea', 'e1'), scope('u-claire', 'e1')])
      teamMembers.find.mockResolvedValue([{ user_id: 'u-lea' }, { user_id: 'u-claire' }])

      const out = await service.distributePreview('u-resp', 'a1')

      expect(out.groups).toEqual([])
      expect(out.unchanged_count).toBe(3)
    })

    it('ignores the zone of someone who left the team', async () => {
      teamMembers.find.mockResolvedValue([{ user_id: 'u-claire' }])

      const out = await service.distributePreview('u-resp', 'a1')

      expect(out.groups.map(g => g.user_id)).toEqual(['u-claire'])
    })

    it('reads only the account contacts of this workspace', async () => {
      await service.distributePreview('u-resp', 'a1')
      expect(contacts.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1', account_id: 'a1' }) }),
      )
    })

    it('refuses a plain member who is neither responsible nor manager (the guard says NO)', async () => {
      await expect(service.distributePreview('u-stranger', 'a1')).rejects.toBeInstanceOf(ForbiddenException)
      expect(contacts.find).not.toHaveBeenCalled()
    })

    it('answers 404 for an account of another workspace', async () => {
      accounts.findOne.mockResolvedValue(null)
      await expect(service.distributePreview('u-resp', 'a-other')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('lets a manager preview even when not responsible', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'admin' })
      await expect(service.distributePreview('u-admin', 'a1')).resolves.toMatchObject({ unchanged_count: 1 })
    })

    it('refuses in the demo workspace', async () => {
      workspaceContext.isDemoWorkspace.mockResolvedValue(true)
      await expect(service.distributePreview('u-resp', 'a1')).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('apply', () => {
    it('writes with a WHERE assigned_to IS NULL guard, one update per member', async () => {
      const { fingerprint } = await service.distributePreview('u-resp', 'a1')

      const out = await service.distributeApply('u-resp', 'a1', fingerprint)

      expect(out).toEqual({ applied: 2 })
      expect(contacts.update).toHaveBeenCalledTimes(2)
      for (const [where] of contacts.update.mock.calls) {
        expect(where).toEqual(expect.objectContaining({ workspace_id: 'ws-1', account_id: 'a1' }))
        expect(where.assigned_to).toEqual(IsNull())
      }
    })

    it('refuses a stale preview: a contact got a holder in between', async () => {
      const { fingerprint } = await service.distributePreview('u-resp', 'a1')
      contacts.find.mockResolvedValue([contact('c1', 'e1', 'u-claire'), contact('c2', 'e2'), contact('c3', null)])

      await expect(service.distributeApply('u-resp', 'a1', fingerprint)).rejects.toBeInstanceOf(ConflictException)
      expect(contacts.update).not.toHaveBeenCalled()
    })

    it('refuses a stale preview: a zone changed in between', async () => {
      const { fingerprint } = await service.distributePreview('u-resp', 'a1')
      scopes.find.mockResolvedValue([scope('u-claire', 'e1', 'CIB'), scope('u-claire', 'e2', 'PF')])

      await expect(service.distributeApply('u-resp', 'a1', fingerprint)).rejects.toBeInstanceOf(ConflictException)
      expect(contacts.update).not.toHaveBeenCalled()
    })

    it('refuses a plain member before any write', async () => {
      await expect(service.distributeApply('u-stranger', 'a1', 'x'.repeat(64))).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(contacts.update).not.toHaveBeenCalled()
    })
  })

  describe('assignee candidates (selector order)', () => {
    it('puts the member covering the contact entity first, hiding nobody', async () => {
      contacts.findOne.mockResolvedValue({ id: 'c1', entity_id: 'e1', account_id: 'a1', workspace_id: 'ws-1' })
      scopes.find.mockResolvedValue([scope('u-claire', 'e1', 'CIB')])

      const out = await service.assigneeCandidates('u-resp', 'c1')

      expect(out.items.map(i => i.user_id)).toEqual(['u-claire', 'u-lea', 'u-resp'])
      expect(out.items[0].covers).toEqual(['CIB'])
    })

    it('is scoped to the workspace: a foreign contact is a 404', async () => {
      contacts.findOne.mockResolvedValue(null)
      await expect(service.assigneeCandidates('u-resp', 'c-foreign')).rejects.toBeInstanceOf(NotFoundException)
      expect(contacts.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1' }) }),
      )
    })

    it('#4996.4 — a BU zone covers a contact whose account carries that BU (account read within the workspace)', async () => {
      contacts.findOne.mockResolvedValue({ id: 'c2', entity_id: null, account_id: 'a1', workspace_id: 'ws-1' })
      accounts.findOne.mockResolvedValue({ id: 'a1', business_unit_id: 'bu-lyon' })
      scopes.find.mockResolvedValue([
        { user_id: 'u-lea', entity_id: null, business_unit_id: 'bu-lyon', label: 'Agence Lyon' },
        { user_id: 'u-claire', entity_id: null, business_unit_id: 'bu-paris', label: 'Agence Paris' },
      ])

      const out = await service.assigneeCandidates('u-resp', 'c2')

      expect(out.items.map(i => i.user_id)).toEqual(['u-lea', 'u-claire', 'u-resp'])
      expect(out.items[0].covers).toEqual(['Agence Lyon'])
      expect(out.items[1].covers).toEqual([])
      expect(accounts.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1', workspace_id: 'ws-1' } }),
      )
    })

    it('#4996.4 — entity AND BU zones: union, both labels named', async () => {
      contacts.findOne.mockResolvedValue({ id: 'c1', entity_id: 'e1', account_id: 'a1', workspace_id: 'ws-1' })
      accounts.findOne.mockResolvedValue({ id: 'a1', business_unit_id: 'bu-lyon' })
      scopes.find.mockResolvedValue([
        scope('u-claire', 'e1', 'CIB'),
        { user_id: 'u-lea', entity_id: null, business_unit_id: 'bu-lyon', label: 'Agence Lyon' },
      ])

      const out = await service.assigneeCandidates('u-resp', 'c1')

      expect(out.items.map(i => i.user_id)).toEqual(['u-claire', 'u-lea', 'u-resp'])
      expect(out.items[1].covers).toEqual(['Agence Lyon'])
    })

    it('keeps plain order for a contact without account', async () => {
      contacts.findOne.mockResolvedValue({ id: 'c9', entity_id: null, account_id: null, workspace_id: 'ws-1' })
      const out = await service.assigneeCandidates('u-resp', 'c9')
      expect(out.items.map(i => i.user_id)).toEqual(['u-claire', 'u-lea', 'u-resp'])
      expect(scopes.find).not.toHaveBeenCalled()
    })
  })
})
