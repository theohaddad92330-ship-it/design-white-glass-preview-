import { AccountsService } from './accounts.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * `GET /accounts/needs` — portfolio-wide "besoins" feed. The projection is raw
 * SQL (JSONB sub-keys pulled inside Postgres), so the proofs here are about the
 * CONTRACT of that query: workspace scoping, no deleted rows, only accounts that
 * actually carry a need, and a graceful empty result on failure.
 */
describe('AccountsService.listAccountNeeds', () => {
  let repo: MockRepository<AccountEntity>
  let service: AccountsService

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    service = new AccountsService(repo as never, {} as never, workspaceContext as never, {} as never)
  })

  it('scopes on the workspace, excludes deleted rows and keeps only accounts carrying a need', async () => {
    repo.manager.query.mockResolvedValue([])

    await service.listAccountNeeds('ws-1')

    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['ws-1'])
    expect(sql).toContain('a.workspace_id = $1')
    expect(sql).toContain("a.status <> 'deleted'")
    expect(sql).toContain("jsonb_array_length(a.raw_analysis -> 'pains') > 0")
    expect(sql).toContain('jsonb_array_length(a.it_challenges) > 0')
    expect(sql).toContain("COALESCE(a.raw_analysis ->> 'it_implications_for_esn', '') <> ''")
  })

  it('projects only the need-bearing slices — never the whole raw_analysis blob', async () => {
    repo.manager.query.mockResolvedValue([])

    await service.listAccountNeeds('ws-1')

    const [sql] = repo.manager.query.mock.calls[0] as [string]
    expect(sql).toMatch(/a\.raw_analysis -> 'pains'.*\s+AS pains/)
    expect(sql).toMatch(/a\.raw_analysis -> 'program_names'.*\s+AS programs/)
    expect(sql).toMatch(/a\.raw_analysis -> 'angles'.*\s+AS angles/)
    expect(sql).not.toMatch(/a\.raw_analysis\s+AS raw_analysis/)
  })

  it('returns the projected rows as-is', async () => {
    const row = {
      account_id: '11111111-1111-1111-1111-111111111111',
      company_name: 'Doctolib',
      sector: 'Santé',
      score: 8.4,
      updated_at: '2026-07-01T10:00:00.000Z',
      it_implications: 'Industrialisation IA',
      pains: [{ pain: 'Scalabilité', esn_offer: 'SRE' }],
      it_challenges: [],
      programs: [],
      angles: [],
    }
    repo.manager.query.mockResolvedValue([row])

    await expect(service.listAccountNeeds('ws-1')).resolves.toEqual([row])
  })

  it('degrades to an empty feed when the query fails (the page must not crash)', async () => {
    repo.manager.query.mockRejectedValue(new Error('connection lost'))

    await expect(service.listAccountNeeds('ws-1')).resolves.toEqual([])
  })
})
