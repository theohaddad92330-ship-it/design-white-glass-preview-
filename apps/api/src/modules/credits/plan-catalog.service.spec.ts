import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PlanCatalogService } from './plan-catalog.service'
import { PLAN_CATALOG_DEFAULTS } from './plan-catalog.defaults'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const teamRow = (over: Partial<PlanDefinitionEntity> = {}): PlanDefinitionEntity =>
  ({
    key: 'team',
    label: 'Team',
    price_cents: 25900,
    accounts_limit: 50,
    enrichment_credits: 100,
    seats: 3,
    extra_seat_price_cents: 2900,
    self_serve: true,
    sort_order: 2,
    ...over,
  }) as PlanDefinitionEntity

describe('PlanCatalogService', () => {
  let repo: MockRepository<PlanDefinitionEntity>
  let service: PlanCatalogService

  beforeEach(() => {
    repo = createMockRepository<PlanDefinitionEntity>()
    service = new PlanCatalogService(repo as never)
  })

  describe('read + defaults fallback', () => {
    it('reads DB rows into the cache (an edited row overrides the default)', async () => {
      repo.find.mockResolvedValue([teamRow({ price_cents: 30000, accounts_limit: 60 })])
      const team = await service.get('team')
      expect(team).toMatchObject({ key: 'team', price: 30000, accounts_limit: 60, enrichment_credits: 100 })
    })

    it('falls back to the shipped defaults on an empty/un-migrated table', async () => {
      repo.find.mockResolvedValue([])
      expect(await service.getOrDefault('team')).toEqual(PLAN_CATALOG_DEFAULTS.team)
      expect(await service.getOrDefault('trial')).toEqual(PLAN_CATALOG_DEFAULTS.trial)
    })

    it('falls back to the defaults (never crashes) when the DB read throws', async () => {
      repo.find.mockRejectedValue(new Error('db down'))
      // enforcement must still resolve a plan
      expect(await service.getOrDefault('trial')).toEqual(PLAN_CATALOG_DEFAULTS.trial)
      expect((await service.getOrDefault('growth')).accounts_limit).toBe(250)
    })

    it('a missing key in the DB still falls back to its default', async () => {
      repo.find.mockResolvedValue([teamRow()]) // only team present
      expect(await service.getOrDefault('growth')).toEqual(PLAN_CATALOG_DEFAULTS.growth)
    })
  })

  describe('get is strict (byte-identical to PLAN_CONFIG[key])', () => {
    it('returns undefined for a non-catalog / legacy key (no auto-normalisation)', async () => {
      repo.find.mockResolvedValue([])
      expect(await service.get('pro')).toBeUndefined()
      expect(await service.get('scale')).toBeUndefined()
      expect(await service.get('nope')).toBeUndefined()
    })

    it('returns the definition for a canonical key', async () => {
      repo.find.mockResolvedValue([])
      expect(await service.get('team')).toEqual(PLAN_CATALOG_DEFAULTS.team)
    })
  })

  describe('normalizePlanKey (legacy aliases retained)', () => {
    it('maps legacy codes to their renamed tier', () => {
      expect(service.normalizePlanKey('pro')).toBe('team')
      expect(service.normalizePlanKey('business')).toBe('growth')
      expect(service.normalizePlanKey('scale')).toBe('growth')
    })
    it('is identity for canonical keys and undefined otherwise', () => {
      expect(service.normalizePlanKey('team')).toBe('team')
      expect(service.normalizePlanKey('beta')).toBe('beta')
      expect(service.normalizePlanKey('nope')).toBeUndefined()
      expect(service.normalizePlanKey(null)).toBeUndefined()
    })
  })

  describe('all() + views', () => {
    it('orders plans by sort_order', async () => {
      repo.find.mockResolvedValue([])
      const keys = (await service.all()).map(p => p.key)
      // `decouverte` partage le sort_order 0 avec `trial` (les deux paliers
      // d'entrée, aucun des deux dans la grille de checkout) — tri stable.
      expect(keys).toEqual(['trial', 'decouverte', 'starter', 'team', 'growth', 'beta'])
    })

    it('priceGridCents exposes key → price(cents)', async () => {
      repo.find.mockResolvedValue([teamRow({ price_cents: 30000 })])
      const grid = await service.priceGridCents()
      expect(grid.team).toBe(30000)
      expect(grid.growth).toBe(19900) // default — grille du 27/08
    })
  })

  describe('update (admin edit)', () => {
    it('upserts the edited fields (mapping price → price_cents) and refreshes the cache', async () => {
      repo.find.mockResolvedValue([teamRow()]) // initial
      expect((await service.get('team'))?.accounts_limit).toBe(50)

      // After the write the reload returns the new value.
      repo.find.mockResolvedValue([teamRow({ price_cents: 30000, accounts_limit: 99 })])
      const updated = await service.update('team', { price: 30000, accounts_limit: 99 })

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'team', price_cents: 30000, accounts_limit: 99, seats: 3 }),
        ['key'],
      )
      expect(updated).toMatchObject({ key: 'team', price: 30000, accounts_limit: 99 })
      // Cache reflects the edit on the next read.
      expect((await service.get('team'))?.accounts_limit).toBe(99)
    })

    it('preserves non-editable fields (self_serve / sort_order) on edit', async () => {
      repo.find.mockResolvedValue([])
      await service.update('beta', { price: 7900 })
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'beta', price_cents: 7900, self_serve: false, sort_order: 4 }),
        ['key'],
      )
    })

    it('404s an unknown key (create/delete is out of scope for v1)', async () => {
      await expect(service.update('enterprise', { price: 100 })).rejects.toThrow(NotFoundException)
      expect(repo.upsert).not.toHaveBeenCalled()
    })

    it('resolves a legacy alias to its canonical key', async () => {
      repo.find.mockResolvedValue([])
      await service.update('pro', { seats: 5 }) // pro → team
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'team', seats: 5 }), ['key'])
    })

    it('rejects negative / non-integer values', async () => {
      await expect(service.update('team', { price: -1 })).rejects.toThrow(BadRequestException)
      await expect(service.update('team', { accounts_limit: 1.5 })).rejects.toThrow(BadRequestException)
      expect(repo.upsert).not.toHaveBeenCalled()
    })
  })
})
