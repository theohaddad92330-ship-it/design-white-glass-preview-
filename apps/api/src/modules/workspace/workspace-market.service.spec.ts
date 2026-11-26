import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { WorkspaceMarketService } from './workspace-market.service'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

describe('WorkspaceMarketService', () => {
  let service: WorkspaceMarketService
  let workspaces: MockRepository<WorkspaceEntity>
  let context: {
    resolveActiveWorkspace: jest.Mock
    assertRole: jest.Mock
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    context = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      assertRole: jest.fn().mockResolvedValue({ role: 'owner' }),
    }
    service = new WorkspaceMarketService(context as unknown as WorkspaceContextService, workspaces as never)
  })

  describe('getMarket', () => {
    it('resolves the active workspace market with its locale, legal basis and pack', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1', market: 'CH' } as WorkspaceEntity)

      const result = await service.getMarket('user-1')

      expect(context.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      expect(result).toEqual({
        market: 'CH',
        countryCode: 'CH',
        defaultLocale: 'de',
        legalBasis: 'adéquation',
        activeCountryPack: true,
      })
    })

    it('returns the strictly-unchanged FR default when the market is FR', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1', market: 'FR' } as WorkspaceEntity)

      const result = await service.getMarket('user-1')

      expect(result).toEqual({
        market: 'FR',
        countryCode: 'FR',
        defaultLocale: 'fr',
        legalBasis: 'RGPD',
        activeCountryPack: false,
      })
    })
  })

  describe('resolveForWorkspace', () => {
    it('degrades to FR for a null workspace id without hitting the repo', async () => {
      const result = await service.resolveForWorkspace(null)
      expect(result.market).toBe('FR')
      expect(result.countryCode).toBe('FR')
      expect(workspaces.findOne).not.toHaveBeenCalled()
    })

    it('degrades to FR for a missing workspace row', async () => {
      workspaces.findOne.mockResolvedValueOnce(null)
      const result = await service.resolveForWorkspace('ghost')
      expect(result.market).toBe('FR')
    })

    it('degrades to FR for an unknown / malformed stored market value', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1', market: 'DE' } as WorkspaceEntity)
      const result = await service.resolveForWorkspace('ws-1')
      expect(result.market).toBe('FR')
      expect(result.activeCountryPack).toBe(false)
    })

    it('maps BE to its country pack (intra-EU RGPD)', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-2', market: 'BE' } as WorkspaceEntity)
      const result = await service.resolveForWorkspace('ws-2')
      expect(result).toEqual({
        market: 'BE',
        countryCode: 'BE',
        defaultLocale: 'fr',
        legalBasis: 'RGPD',
        activeCountryPack: true,
      })
    })

    it('maps US to English + US state privacy laws (no RGPD) with a backing pack', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-3', market: 'US' } as WorkspaceEntity)
      const result = await service.resolveForWorkspace('ws-3')
      expect(result).toEqual({
        market: 'US',
        countryCode: 'US',
        defaultLocale: 'en',
        legalBasis: 'CCPA',
        activeCountryPack: true,
      })
    })

    it('maps CA to English default + PIPEDA with a backing pack', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-4', market: 'CA' } as WorkspaceEntity)
      const result = await service.resolveForWorkspace('ws-4')
      expect(result).toEqual({
        market: 'CA',
        countryCode: 'CA',
        defaultLocale: 'en',
        legalBasis: 'PIPEDA',
        activeCountryPack: true,
      })
    })
  })

  describe('setMarket', () => {
    it('asserts owner/admin, persists the market and returns the resolved view', async () => {
      const result = await service.setMarket('user-1', 'LU')

      expect(context.assertRole).toHaveBeenCalledWith('user-1', 'ws-1', ['owner', 'admin'])
      expect(workspaces.update).toHaveBeenCalledWith({ id: 'ws-1' }, { market: 'LU' })
      expect(result).toEqual({
        market: 'LU',
        countryCode: 'LU',
        defaultLocale: 'fr',
        legalBasis: 'RGPD',
        activeCountryPack: true,
      })
    })

    it('refuses when the caller lacks the owner/admin role (no write)', async () => {
      context.assertRole.mockRejectedValueOnce(new ForbiddenException('Rôle insuffisant pour cette action'))

      await expect(service.setMarket('member-1', 'CH')).rejects.toBeInstanceOf(ForbiddenException)
      expect(workspaces.update).not.toHaveBeenCalled()
    })

    it('throws NotFound when the workspace row vanished before the update', async () => {
      workspaces.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] })
      await expect(service.setMarket('user-1', 'CH')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
