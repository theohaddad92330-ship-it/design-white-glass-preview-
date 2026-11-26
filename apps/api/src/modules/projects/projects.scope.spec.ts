import { NotFoundException } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import type { ProjectEntity } from '../../database/entities/project.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #3266.1 (#3292, tranché sans Louis) — LE GRAIN équipe/site/projet d'une
 * opportunité : écrit par la même porte que les risques (`PATCH
 * /projects/:id/scope`, `records:write`, espace vérifié), lu par la même
 * projection que la fiche.
 */
describe('ProjectsService.updateScope (#3266.1, #3292)', () => {
  let repo: MockRepository<ProjectEntity>
  let service: ProjectsService

  beforeEach(() => {
    repo = createMockRepository<ProjectEntity>()
    service = new ProjectsService(repo as never)
  })

  it('écrit le grain dans l’espace et rend la ligne (projection qui porte `scope_label`)', async () => {
    const row = { id: 'op-1', scope_label: 'Équipe Data / Site Lyon' }
    repo.manager.query.mockResolvedValue([row])
    const result = await service.updateScope('op-1', 'ws-1', 'Équipe Data / Site Lyon')
    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['op-1', 'ws-1', 'Équipe Data / Site Lyon'])
    expect(sql).toContain('UPDATE opportunities')
    expect(sql).toContain('SET scope_label = $3')
    expect(sql).toContain('o.workspace_id = $2 OR a.workspace_id = $2')
    expect(sql).toContain("a.status <> 'deleted'")
    expect(sql).toContain('o.scope_label')
    expect(result).toEqual(row)
  })

  it('null efface ; hors espace ou erreur → null, jamais d’exception', async () => {
    repo.manager.query.mockResolvedValue([])
    await expect(service.updateScope('op-1', 'ws-1', null)).resolves.toBeNull()
    expect((repo.manager.query.mock.calls[0] as [string, unknown[]])[1]).toEqual(['op-1', 'ws-1', null])
    repo.manager.query.mockRejectedValue(new Error('boom'))
    await expect(service.updateScope('op-1', 'ws-1', 'x')).resolves.toBeNull()
  })
})

describe('ProjectsService.createForWorkspace — porte le grain équipe/site/projet (#3266.1)', () => {
  it('transmet scopeLabel comme dixième paramètre positionnel de l’INSERT', async () => {
    const repo = createMockRepository<ProjectEntity>()
    const service = new ProjectsService(repo as never)
    repo.manager.query.mockResolvedValue([{ id: 'op-1', scope_label: 'Projet Refonte' }])
    await service.createForWorkspace('ws-1', {
      accountId: 'acc-1',
      label: 'Refonte CRM',
      stage: 'confirmed',
      scopeLabel: 'Projet Refonte',
    })
    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('scope_label')
    expect(params[9]).toBe('Projet Refonte')
  })
})

describe('ProjectsService.createForWorkspace — une affaire saisie a toujours une origine (#4336.1)', () => {
  it("écrit source = 'manual', jamais NULL", async () => {
    const repo = createMockRepository<ProjectEntity>()
    const service = new ProjectsService(repo as never)
    repo.manager.query.mockResolvedValue([{ id: 'op-1' }])
    await service.createForWorkspace('ws-1', { accountId: 'acc-1', label: 'RECETTE', stage: 'confirmed' })
    const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain("'manual'::text, NULL::text")
  })
})

describe('ProjectsController.updateScope (#3266.1, #3292)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const call = (projects: unknown) =>
    ProjectsController.prototype.updateScope.call(
      { projects, workspaceContext } as never,
      'op-1',
      { scope_label: 'Équipe Data / Site Lyon' },
      { userId: 'u-1' } as never,
    )

  it('écrit sur l’espace ACTIF de l’appelant', async () => {
    const projects = {
      updateScope: jest.fn().mockResolvedValue({ id: 'op-1', scope_label: 'Équipe Data / Site Lyon' }),
    }
    await expect(call(projects)).resolves.toEqual({ id: 'op-1', scope_label: 'Équipe Data / Site Lyon' })
    expect(projects.updateScope).toHaveBeenCalledWith('op-1', 'ws-1', 'Équipe Data / Site Lyon')
  })

  it('hors espace : 404', async () => {
    await expect(call({ updateScope: jest.fn().mockResolvedValue(null) })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('exige records:write, comme les risques', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ProjectsController.prototype.updateScope)).toEqual([
      'records:write',
    ])
  })
})
