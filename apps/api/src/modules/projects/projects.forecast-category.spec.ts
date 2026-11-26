import { NotFoundException } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import type { ProjectEntity } from '../../database/entities/project.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * L2 Pipe — la catégorie DÉCLARÉE (`commit` / `best_case` / `pipeline` /
 * `omitted`) s'écrit par une porte à elle, comme le risque et le montant :
 * `records:write`, espace vérifié. Une déclaration, jamais une probabilité.
 */
describe('ProjectsService.updateForecastCategory', () => {
  let repo: MockRepository<ProjectEntity>
  let service: ProjectsService

  beforeEach(() => {
    repo = createMockRepository<ProjectEntity>()
    service = new ProjectsService(repo as never)
  })

  it("écrit la catégorie dans l'espace de l'appelant et rend la ligne", async () => {
    const row = { id: 'op-1', forecast_category: 'commit' }
    repo.manager.query.mockResolvedValue([row])
    const result = await service.updateForecastCategory('op-1', 'ws-1', 'commit')
    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['op-1', 'ws-1', 'commit'])
    expect(sql).toContain('UPDATE opportunities')
    expect(sql).toContain('SET forecast_category = $3')
    expect(sql).toContain('o.workspace_id = $2 OR a.workspace_id = $2')
    expect(sql).toContain("a.status <> 'deleted'")
    expect(sql).toContain('o.forecast_category')
    expect(result).toEqual(row)
  })

  it('null efface la déclaration ; hors espace → null ; erreur → null', async () => {
    repo.manager.query.mockResolvedValue([])
    await expect(service.updateForecastCategory('op-1', 'ws-1', null)).resolves.toBeNull()
    expect((repo.manager.query.mock.calls[0] as [string, unknown[]])[1]).toEqual(['op-1', 'ws-1', null])
    repo.manager.query.mockRejectedValue(new Error('boom'))
    await expect(service.updateForecastCategory('op-1', 'ws-1', 'omitted')).resolves.toBeNull()
  })
})

describe('ProjectsController.updateForecastCategory', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const call = (projects: unknown) =>
    ProjectsController.prototype.updateForecastCategory.call(
      { projects, workspaceContext } as never,
      'op-1',
      { forecast_category: 'best_case' } as never,
      { userId: 'u-1' } as never,
    )

  it('porte la même permission que le montant et le risque', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ProjectsController.prototype.updateForecastCategory)).toEqual([
      'records:write',
    ])
  })

  it('résout le workspace actif puis délègue ; 404 si la ligne est absente', async () => {
    const updateForecastCategory = jest.fn().mockResolvedValue({ id: 'op-1' })
    await expect(call({ updateForecastCategory })).resolves.toEqual({ id: 'op-1' })
    expect(updateForecastCategory).toHaveBeenCalledWith('op-1', 'ws-1', 'best_case')
    await expect(call({ updateForecastCategory: jest.fn().mockResolvedValue(null) })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
