import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import type { ProjectEntity } from '../../database/entities/project.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2171.39 — ARCHIVER une opportunité. Même mécanisme que
 * `ProjectPipelineService.archiveNeed` (`project_needs.archived_at`) :
 * `archived_at` seul bouge, `stage`/`outcome` restent ce qu'ils étaient, et
 * archiver une opportunité déjà archivée refuse plutôt que de réussir en
 * silence.
 */
describe('ProjectsService.archiveOpportunity (#2171.39)', () => {
  let repo: MockRepository<ProjectEntity>
  let service: ProjectsService

  beforeEach(() => {
    repo = createMockRepository<ProjectEntity>()
    service = new ProjectsService(repo as never)
  })

  it('archive une opportunité active et rend la ligne à jour', async () => {
    repo.manager.query
      .mockResolvedValueOnce([{ archived_at: null }])
      .mockResolvedValueOnce([{ id: 'op-1', archived_at: '2026-09-25T00:00:00.000Z' }])

    const result = await service.archiveOpportunity('op-1', 'ws-1', true)

    expect(result).toEqual({ status: 'ok', row: { id: 'op-1', archived_at: '2026-09-25T00:00:00.000Z' } })
    const [updateSql, updateParams] = repo.manager.query.mock.calls[1] as [string, unknown[]]
    expect(updateSql).toContain('SET archived_at = $3')
    expect(updateParams[0]).toBe('op-1')
    expect(updateParams[1]).toBe('ws-1')
    expect(updateParams[2]).toBeInstanceOf(Date)
  })

  it('désarchive : remet archived_at à null, rien d’autre', async () => {
    repo.manager.query
      .mockResolvedValueOnce([{ archived_at: '2026-09-20T00:00:00.000Z' }])
      .mockResolvedValueOnce([{ id: 'op-1', archived_at: null }])

    const result = await service.archiveOpportunity('op-1', 'ws-1', false)

    expect(result).toEqual({ status: 'ok', row: { id: 'op-1', archived_at: null } })
    const [, updateParams] = repo.manager.query.mock.calls[1] as [string, unknown[]]
    expect(updateParams[2]).toBeNull()
  })

  it('déjà archivée : refuse plutôt qu’un succès silencieux', async () => {
    repo.manager.query.mockResolvedValueOnce([{ archived_at: '2026-09-20T00:00:00.000Z' }])
    await expect(service.archiveOpportunity('op-1', 'ws-1', true)).resolves.toEqual({ status: 'already' })
    expect(repo.manager.query).toHaveBeenCalledTimes(1)
  })

  it('hors espace, introuvable, ou erreur : not_found — jamais d’exception', async () => {
    repo.manager.query.mockResolvedValueOnce([])
    await expect(service.archiveOpportunity('op-9', 'ws-1', true)).resolves.toEqual({ status: 'not_found' })

    repo.manager.query.mockRejectedValueOnce(new Error('boom'))
    await expect(service.archiveOpportunity('op-1', 'ws-1', true)).resolves.toEqual({ status: 'not_found' })
  })
})

describe('ProjectsController.archiveOpportunity / unarchiveOpportunity (#2171.39)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const callArchive = (projects: unknown) =>
    ProjectsController.prototype.archiveOpportunity.call({ projects, workspaceContext } as never, 'op-1', {
      userId: 'u-1',
    } as never)
  const callUnarchive = (projects: unknown) =>
    ProjectsController.prototype.unarchiveOpportunity.call({ projects, workspaceContext } as never, 'op-1', {
      userId: 'u-1',
    } as never)

  it('archive sur l’espace ACTIF de l’appelant', async () => {
    const projects = { archiveOpportunity: jest.fn().mockResolvedValue({ status: 'ok', row: { id: 'op-1' } }) }
    await expect(callArchive(projects)).resolves.toEqual({ id: 'op-1' })
    expect(projects.archiveOpportunity).toHaveBeenCalledWith('op-1', 'ws-1', true)
  })

  it('introuvable : 404', async () => {
    await expect(
      callArchive({ archiveOpportunity: jest.fn().mockResolvedValue({ status: 'not_found' }) }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('déjà archivée : 400 nommé, pas un succès muet', async () => {
    await expect(
      callArchive({ archiveOpportunity: jest.fn().mockResolvedValue({ status: 'already' }) }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('désarchive avec archived=false', async () => {
    const projects = { archiveOpportunity: jest.fn().mockResolvedValue({ status: 'ok', row: { id: 'op-1' } }) }
    await callUnarchive(projects)
    expect(projects.archiveOpportunity).toHaveBeenCalledWith('op-1', 'ws-1', false)
  })

  it('exige records:write, comme le montant et les risques', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ProjectsController.prototype.archiveOpportunity)).toEqual([
      'records:write',
    ])
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ProjectsController.prototype.unarchiveOpportunity)).toEqual([
      'records:write',
    ])
  })
})
