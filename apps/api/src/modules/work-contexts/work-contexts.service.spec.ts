import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { BusinessUnitService } from '../business-unit/business-unit.service'
import type { WorkContextEntity } from '../../database/entities/work-context.entity'
import type { WorkContextActivationEntity } from '../../database/entities/work-context-activation.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { WorkContextsService } from './work-contexts.service'

describe('WorkContextsService', () => {
  let repo: MockRepository<WorkContextEntity>
  let activations: MockRepository<WorkContextActivationEntity>
  let workspaceContext: { resolveActiveWorkspace: jest.Mock; assertMember: jest.Mock }
  let businessUnits: { perimetersOf: jest.Mock }
  let service: WorkContextsService

  beforeEach(() => {
    repo = createMockRepository<WorkContextEntity>()
    activations = createMockRepository<WorkContextActivationEntity>()
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
      assertMember: jest.fn().mockResolvedValue({}),
    }
    businessUnits = { perimetersOf: jest.fn().mockResolvedValue([]) }
    service = new WorkContextsService(
      repo as never,
      activations as never,
      workspaceContext as unknown as WorkspaceContextService,
      businessUnits as unknown as BusinessUnitService,
    )
  })

  describe('create', () => {
    it('#2455.1/.8 — persists only to work_contexts, never touches profiles/esn_profiles', async () => {
      repo.save.mockImplementation(async (entity: Partial<WorkContextEntity>) => ({
        ...entity,
        created_at: new Date('2026-09-22T20:00:00.000Z'),
        updated_at: new Date('2026-09-22T20:00:00.000Z'),
      }))

      await service.create('u1', {
        name: 'Automobile Brest',
        visibility: 'personal',
        status: 'enregistre',
      } as never)

      // Le seul repository injecté est celui de work_contexts (via @InjectRepository) —
      // aucun accès à `profiles`/`esn_profiles` n'existe dans ce service : la preuve
      // structurelle est qu'aucune requête brute n'est jamais lancée ici.
      expect(repo.manager.query).not.toHaveBeenCalled()
      const created = repo.create.mock.calls[0][0] as Partial<WorkContextEntity>
      expect(created).toMatchObject({ workspace_id: 'ws-1', owner_user_id: 'u1', name: 'Automobile Brest' })
    })

    it('#2455.2 — carries the full WORK_CONTEXT object back on creation', async () => {
      repo.save.mockResolvedValue({
        id: 'wc-1',
        workspace_id: 'ws-1',
        owner_user_id: 'u1',
        name: 'Cyber grands comptes IDF',
        visibility: 'personal',
        business_unit_id: null,
        objective: null,
        offer: null,
        expertise: null,
        technologies: [],
        sectors: ['Cyber'],
        territories: ['Île-de-France'],
        company_types: [],
        sizes: [],
        delivery_model: null,
        exclusions: [],
        reference_list: [],
        capacity: null,
        data_layers: [],
        status: 'enregistre',
        version: 1,
        created_at: new Date('2026-09-22T20:00:00.000Z'),
        updated_at: new Date('2026-09-22T20:00:00.000Z'),
      } as WorkContextEntity)

      const result = await service.create('u1', {
        name: 'Cyber grands comptes IDF',
        visibility: 'personal',
        status: 'enregistre',
        sectors: ['Cyber'],
        territories: ['Île-de-France'],
      } as never)

      expect(Object.keys(result).sort()).toEqual(
        [
          'context_id',
          'name',
          'owner',
          'workspace',
          'visibility',
          'business_unit_id',
          'objective',
          'offer',
          'expertise',
          'technologies',
          'sectors',
          'territories',
          'company_types',
          'sizes',
          'delivery_model',
          'exclusions',
          'reference_list',
          'capacity',
          'data_layers',
          'created_at',
          'updated_at',
          'version',
          'status',
        ].sort(),
      )
    })
  })

  describe('list', () => {
    it('#2455.7 — scopes to own contexts + BU + group, excludes archived by default', async () => {
      businessUnits.perimetersOf.mockResolvedValue(['bu-9'])
      repo._qb.getMany.mockResolvedValue([])

      await service.list('u1')

      expect(repo._qb.andWhere).toHaveBeenCalledWith("wc.status <> 'archive'")
      const scopeCall = repo._qb.andWhere.mock.calls.find(call => String(call[0]).includes('wc.owner_user_id')) as [
        string,
        Record<string, unknown>,
      ]
      expect(scopeCall[1]).toMatchObject({ userId: 'u1', buIds: ['bu-9'] })
    })
  })

  describe('list — #3477', () => {
    it('sans périmètre BU, aucune valeur non-UUID n’est liée à `business_unit_id` (colonne uuid → 500 en prod)', async () => {
      businessUnits.perimetersOf.mockResolvedValue([])
      repo._qb.getMany.mockResolvedValue([])

      await service.list('u1')

      const scopeCall = repo._qb.andWhere.mock.calls.find(call => String(call[0]).includes('wc.owner_user_id')) as [
        string,
        Record<string, unknown>,
      ]
      expect(scopeCall[0]).not.toContain('business_unit_id IN')
      expect(scopeCall[1]).not.toHaveProperty('buIds')
    })
  })

  describe('activate', () => {
    it('#2455.5 — always mints a NEW conversation id, never reuses one', async () => {
      repo.findOne.mockResolvedValue({
        id: 'wc-1',
        workspace_id: 'ws-1',
        owner_user_id: 'u1',
        visibility: 'personal',
        status: 'enregistre',
        created_at: new Date('2026-09-22T20:00:00.000Z'),
        updated_at: new Date('2026-09-22T20:00:00.000Z'),
      } as WorkContextEntity)

      const first = await service.activate('u1', 'wc-1')
      const second = await service.activate('u1', 'wc-1')

      expect(first.conversation_id).not.toBe(second.conversation_id)
      expect(activations.save).toHaveBeenCalledTimes(2)
    })

    it('rejects a context from another workspace (404, no cross-tenant read)', async () => {
      repo.findOne.mockResolvedValue({
        id: 'wc-1',
        workspace_id: 'ws-OTHER',
        owner_user_id: 'someone-else',
        visibility: 'personal',
        status: 'enregistre',
      } as WorkContextEntity)

      await expect(service.activate('u1', 'wc-1')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('rejects a personal context that belongs to another member', async () => {
      repo.findOne.mockResolvedValue({
        id: 'wc-1',
        workspace_id: 'ws-1',
        owner_user_id: 'someone-else',
        visibility: 'personal',
        status: 'enregistre',
      } as WorkContextEntity)

      await expect(service.activate('u1', 'wc-1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('archive', () => {
    it('#2455.3 — only the owner can archive their context', async () => {
      repo.findOne.mockResolvedValue({
        id: 'wc-1',
        workspace_id: 'ws-1',
        owner_user_id: 'someone-else',
        visibility: 'group',
        status: 'enregistre',
      } as WorkContextEntity)

      await expect(service.archive('u1', 'wc-1')).rejects.toBeInstanceOf(ForbiddenException)
      expect(repo.save).not.toHaveBeenCalled()
    })
  })

  describe('usageSignal (#2455.6)', () => {
    it('reads the sectors of a PERSONAL context the caller owns, plus how many times THEY activated it', async () => {
      repo.findOne.mockResolvedValue({
        id: 'wc-1',
        workspace_id: 'ws-1',
        owner_user_id: 'u1',
        visibility: 'personal',
        status: 'enregistre',
        sectors: ['Aéronautique', 'Défense'],
      } as WorkContextEntity)
      activations.count.mockResolvedValue(4)

      const signal = await service.usageSignal('u1', 'wc-1')

      expect(signal).toEqual({ sectors: ['Aéronautique', 'Défense'], activationCount: 4 })
      expect(activations.count).toHaveBeenCalledWith({ where: { work_context_id: 'wc-1', user_id: 'u1' } })
    })

    it('renders null for a context that is not the caller’s own personal context — never proposes a diff on someone else’s usage', async () => {
      repo.findOne.mockResolvedValue({
        id: 'wc-1',
        workspace_id: 'ws-1',
        owner_user_id: 'u1',
        visibility: 'bu',
        status: 'enregistre',
        business_unit_id: 'bu-9',
        sectors: ['Aéronautique'],
      } as WorkContextEntity)

      const signal = await service.usageSignal('u1', 'wc-1')

      expect(signal).toBeNull()
      expect(activations.count).not.toHaveBeenCalled()
    })
  })
})
