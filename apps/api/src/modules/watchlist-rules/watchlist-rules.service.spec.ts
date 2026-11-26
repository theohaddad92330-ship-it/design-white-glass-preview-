import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WatchlistRuleEntity } from './watchlist-rule.entity'
import { WatchlistRulesService } from './watchlist-rules.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const OTHER_WORKSPACE = '33333333-3333-3333-3333-333333333333'

function makeRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: Partial<WatchlistRuleEntity>) => v),
    save: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as jest.Mocked<Repository<WatchlistRuleEntity>>
}

function makeWorkspace(workspaceId = WORKSPACE) {
  return {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId, role: 'owner' }),
  } as unknown as jest.Mocked<WorkspaceContextService>
}

function makeRow(over: Partial<WatchlistRuleEntity> = {}): WatchlistRuleEntity {
  return {
    id: 'rule-1',
    user_id: USER,
    workspace_id: WORKSPACE,
    kind: 'techno',
    value: 'ServiceNow',
    created_at: new Date('2026-07-23T10:00:00.000Z'),
    ...over,
  } as WatchlistRuleEntity
}

describe('WatchlistRulesService', () => {
  describe('list', () => {
    it('scopes the read to the active workspace and maps to the API shape', async () => {
      const repo = makeRepo()
      ;(repo.find as jest.Mock).mockResolvedValue([makeRow()])
      const service = new WatchlistRulesService(repo, makeWorkspace())

      const result = await service.list(USER)

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace_id: WORKSPACE }, order: { created_at: 'DESC' } }),
      )
      expect(result).toEqual([
        { id: 'rule-1', kind: 'techno', value: 'ServiceNow', created_at: '2026-07-23T10:00:00.000Z' },
      ])
    })
  })

  describe('create', () => {
    it('inserts a workspace-scoped rule stamped with the creator', async () => {
      const repo = makeRepo()
      ;(repo.save as jest.Mock).mockResolvedValue(makeRow())
      const service = new WatchlistRulesService(repo, makeWorkspace())

      const result = await service.create(USER, { kind: 'techno', value: 'ServiceNow' })

      expect(repo.create).toHaveBeenCalledWith({
        user_id: USER,
        workspace_id: WORKSPACE,
        kind: 'techno',
        value: 'ServiceNow',
      })
      expect(result.value).toBe('ServiceNow')
    })

    it('is idempotent: an existing identical rule is returned, never duplicated', async () => {
      const repo = makeRepo()
      ;(repo.findOne as jest.Mock).mockResolvedValue(makeRow({ id: 'dup' }))
      const service = new WatchlistRulesService(repo, makeWorkspace())

      const result = await service.create(USER, { kind: 'techno', value: 'ServiceNow' })

      expect(result.id).toBe('dup')
      expect(repo.save).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('deletes by (id AND workspace) — never by id alone', async () => {
      const repo = makeRepo()
      const service = new WatchlistRulesService(repo, makeWorkspace())

      await service.remove(USER, 'rule-1')

      expect(repo.delete).toHaveBeenCalledWith({ id: 'rule-1', workspace_id: WORKSPACE })
    })

    it('404s when nothing was deleted (unknown or foreign-workspace rule)', async () => {
      const repo = makeRepo()
      ;(repo.delete as jest.Mock).mockResolvedValue({ affected: 0 })
      const service = new WatchlistRulesService(repo, makeWorkspace(OTHER_WORKSPACE))

      await expect(service.remove(USER, 'rule-1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
