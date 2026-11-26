import { AccountShareService } from './account-share.service'
import { AccountShareEntity } from '../../database/entities/account-share.entity'
import type { ConfigService } from '@nestjs/config'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

describe('AccountShareService (workspace-scoped write, multi-user Phase 2)', () => {
  let service: AccountShareService
  let repo: MockRepository<AccountShareEntity>
  const config = { get: jest.fn((_key: string, fallback: string) => fallback) } as unknown as ConfigService
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'resolveActiveWorkspace'>>

  beforeEach(() => {
    repo = createMockRepository<AccountShareEntity>()
    // save echoes the created row back with generated timestamps.
    repo.save.mockImplementation(async (row: Partial<AccountShareEntity>) => ({
      ...row,
      expires_at: row.expires_at,
      created_at: new Date('2026-07-13T00:00:00.000Z'),
    }))
    service = new AccountShareService(repo as never, config, workspaceContext as never)
  })

  it('stamps user_id (created-by) AND the resolved workspace_id on the share row', async () => {
    await service.mintShareLink('acc-1', 'user-1', 'Nordia Group')

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 'acc-1', user_id: 'user-1', workspace_id: 'ws-1' }),
    )
  })

  it('returns a slug-based share URL derived from the company name', async () => {
    const link = await service.mintShareLink('acc-1', 'user-1', 'Nordia Group')
    expect(link.slug).toMatch(/^nordia-group-/)
    expect(link.url).toContain('/share/')
  })

  // #2914 (#2128.11) — un lien de partage porte le dossier ENTIER ou une
  // section ; `section` absent = 'full', le comportement historique.
  it("defaults section to 'full' when the caller passes none", async () => {
    const link = await service.mintShareLink('acc-1', 'user-1', 'Nordia Group')
    expect(link.section).toBe('full')
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ section: 'full' }))
  })

  it("persists and returns the requested section ('evaluation')", async () => {
    const link = await service.mintShareLink('acc-1', 'user-1', 'Nordia Group', 'evaluation')
    expect(link.section).toBe('evaluation')
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ section: 'evaluation' }))
  })
})
