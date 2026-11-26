/**
 * Capacité « Marchés locaux » (L1) — le service : scopage par espace, plafonds, 404 hors espace,
 * brief validé à la lecture, comptes liés calculés à la lecture.
 */
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { createMarketZoneSchema } from './market-brief.dto'
import { MarketBriefService } from './market-brief.service'

const ctx = { userId: 'u1', workspaceId: 'ws-1' }

const zoneRow = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: 'ws-1',
  slug: 'lille',
  label: 'Lille',
  scope: 'france' as const,
  departments: ['59'],
  cantons: [],
  cities: ['Lille'],
  brief: null,
  brief_origin: null,
  brief_generated_at: null,
  ...over,
})

function build(rows: ReturnType<typeof zoneRow>[] = [zoneRow()]) {
  const zones = {
    find: jest.fn(async ({ where }: { where: { workspace_id: string } }) =>
      rows.filter(r => r.workspace_id === where.workspace_id),
    ),
    findOne: jest.fn(
      async ({ where }: { where: { id: string; workspace_id: string } }) =>
        rows.find(r => r.id === where.id && r.workspace_id === where.workspace_id) ?? null,
    ),
    create: jest.fn((v: object) => ({ id: 'new-id', ...v })),
    save: jest.fn(async (v: object) => v),
    delete: jest.fn(async () => ({ affected: 1 })),
  }
  const accounts = {
    find: jest.fn(async () => [
      { id: 'a1', company_name: 'ADEO', headquarters: '59650 Villeneuve-d’Ascq' },
      { id: 'a2', company_name: 'Orange', headquarters: 'Paris (75)' },
    ]),
  }
  const sites = { find: jest.fn(async () => [{ account_id: 'a2', city: 'Lille', postal_code: '59000' }]) }
  const needs = { find: jest.fn(async () => []) }
  const missions = { find: jest.fn(async () => []) }
  const service = new MarketBriefService(
    zones as never,
    accounts as never,
    sites as never,
    needs as never,
    missions as never,
  )
  return { service, zones, accounts, sites, needs, missions }
}

describe('MarketBriefService', () => {
  it('liste les zones de l’espace courant seulement, avec « a un brief »', async () => {
    const { service, zones } = build([
      zoneRow(),
      zoneRow({ id: '22222222-2222-4222-8222-222222222222', workspace_id: 'ws-autre', label: 'Nantes' }),
    ])
    const list = await service.list(ctx)
    expect(list).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'lille',
        label: 'Lille',
        scope: 'france',
        has_brief: false,
        brief_generated_at: null,
      },
    ])
    expect(zones.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
  })

  it('404 sur une zone d’un autre espace', async () => {
    const { service } = build([zoneRow({ workspace_id: 'ws-autre' })])
    await expect(service.get(ctx, zoneRow().id)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.remove(ctx, zoneRow().id)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('get : comptes liés par siège, site, et pas les autres espaces', async () => {
    const { service, accounts } = build()
    const detail = await service.get(ctx, zoneRow().id)
    expect(detail.linked_accounts).toEqual([
      { account_id: 'a1', name: 'ADEO', match: 'headquarters' },
      { account_id: 'a2', name: 'Orange', match: 'site' },
    ])
    expect(accounts.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
    expect(detail.brief).toBeNull()
    expect(detail.brief_invalid).toBe(false)
  })

  it('get : un brief stocké qui ne passe pas le contrat n’est pas servi', async () => {
    const { service } = build([zoneRow({ brief: { zone: 'cassé' } })])
    const detail = await service.get(ctx, zoneRow().id)
    expect(detail.brief).toBeNull()
    expect(detail.brief_invalid).toBe(true)
  })

  it('create : pose l’espace du token, un slug unique, et refuse au-delà de 10 zones', async () => {
    const { service, zones } = build()
    const created = await service.create(ctx, {
      label: 'Lille',
      scope: 'france',
      departments: ['59'],
      cantons: [],
      cities: [],
    })
    expect(created.slug).toBe('lille-2')
    expect(zones.save).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'ws-1', created_by: 'u1' }))

    const full = build(Array.from({ length: 10 }, (_, i) => zoneRow({ id: `id-${i}`, slug: `z${i}`, label: `Z${i}` })))
    await expect(
      full.service.create(ctx, { label: 'Onzième', scope: 'france', departments: ['75'], cantons: [], cities: [] }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('remove : supprime dans l’espace', async () => {
    const { service, zones } = build()
    await service.remove(ctx, zoneRow().id)
    expect(zones.delete).toHaveBeenCalledWith({ id: zoneRow().id, workspace_id: 'ws-1' })
  })

  it('priceGridFor : lit besoins et missions de l’espace seulement', async () => {
    const { service, needs, missions } = build()
    await service.priceGridFor(ctx, zoneRow().id, new Date('2026-10-04T10:00:00Z'))
    expect(needs.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
    expect(missions.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
  })
})

describe('createMarketZoneSchema', () => {
  const ok = { label: 'Lille', scope: 'france', departments: ['59'] }
  it('accepte une zone france et met les codes en majuscules', () => {
    expect(createMarketZoneSchema.parse({ ...ok, departments: ['2a'] }).departments).toEqual(['2A'])
  })
  it('refuse plus de 6 départements', () => {
    const seven = ['59', '62', '80', '02', '60', '76', '27']
    expect(createMarketZoneSchema.safeParse({ ...ok, departments: seven }).success).toBe(false)
    expect(createMarketZoneSchema.safeParse({ ...ok, departments: seven.slice(0, 6) }).success).toBe(true)
  })
  it('refuse France et Suisse mêlées, et une zone france sans département', () => {
    expect(createMarketZoneSchema.safeParse({ ...ok, cantons: ['VD'] }).success).toBe(false)
    expect(createMarketZoneSchema.safeParse({ label: 'X', scope: 'france' }).success).toBe(false)
  })
  it('accepte une zone suisse par cantons', () => {
    expect(createMarketZoneSchema.safeParse({ label: 'Vaud', scope: 'suisse', cantons: ['VD'] }).success).toBe(true)
  })
  it('refuse un champ inconnu (ex. workspace_id dans le corps)', () => {
    expect(createMarketZoneSchema.safeParse({ ...ok, workspace_id: 'ws-x' }).success).toBe(false)
  })
})
