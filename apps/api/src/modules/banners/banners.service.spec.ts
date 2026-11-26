/// <reference types="jest" />
import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { CreateBanner, UpdateBanner } from '@bellum/contracts'
import { BannerEntity } from '../../database/entities/banner.entity'
import { BannersService, bannerMatchesAudience, bannerMatchesPlacement, bannerWithinWindow } from './banners.service'

function makeBanner(o: Partial<BannerEntity> = {}): BannerEntity {
  return {
    id: o.id ?? 'b1',
    kind: o.kind ?? 'announcement',
    variant: o.variant ?? 'info',
    title_fr: o.title_fr ?? 'Titre FR',
    title_en: o.title_en ?? 'Title EN',
    body_fr: o.body_fr ?? '',
    body_en: o.body_en ?? '',
    cta_label_fr: o.cta_label_fr ?? null,
    cta_label_en: o.cta_label_en ?? null,
    cta_url: o.cta_url ?? null,
    placement: o.placement ?? 'app',
    audience: o.audience ?? 'all',
    starts_at: o.starts_at ?? null,
    ends_at: o.ends_at ?? null,
    dismissible: o.dismissible ?? true,
    priority: o.priority ?? 0,
    active: o.active ?? true,
    version: o.version ?? 1,
    created_by: o.created_by ?? null,
    created_at: o.created_at ?? new Date('2026-01-01T00:00:00.000Z'),
    updated_at: o.updated_at ?? new Date('2026-01-01T00:00:00.000Z'),
  }
}

function makeRepo(rows: BannerEntity[] = []) {
  const find = jest.fn().mockResolvedValue(rows)
  const findOne = jest.fn()
  const create = jest.fn((x: Partial<BannerEntity>) => x)
  const save = jest.fn(async (x: BannerEntity) => ({
    ...x,
    id: x.id ?? 'generated-id',
    created_at: x.created_at ?? new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-02-01T00:00:00.000Z'),
  }))
  const del = jest.fn().mockResolvedValue({ affected: 1 })
  const repo = { find, findOne, create, save, delete: del } as unknown as Repository<BannerEntity>
  return { repo, find, findOne, create, save, del }
}

const NOW = new Date('2026-07-18T12:00:00.000Z')
const PAST = new Date('2026-07-10T00:00:00.000Z')
const FUTURE = new Date('2026-07-25T00:00:00.000Z')

describe('pure visibility predicates', () => {
  it('bannerMatchesPlacement: exact surface or both', () => {
    expect(bannerMatchesPlacement('app', 'app')).toBe(true)
    expect(bannerMatchesPlacement('both', 'app')).toBe(true)
    expect(bannerMatchesPlacement('website', 'app')).toBe(false)
    expect(bannerMatchesPlacement('app', 'website')).toBe(false)
  })

  it('bannerMatchesAudience: all is universal, authenticated gated', () => {
    expect(bannerMatchesAudience('all', false)).toBe(true)
    expect(bannerMatchesAudience('all', true)).toBe(true)
    expect(bannerMatchesAudience('authenticated', true)).toBe(true)
    expect(bannerMatchesAudience('authenticated', false)).toBe(false)
  })

  it('bannerWithinWindow: before / within / after / open bounds', () => {
    expect(bannerWithinWindow({ starts_at: FUTURE, ends_at: null }, NOW)).toBe(false) // not started
    expect(bannerWithinWindow({ starts_at: PAST, ends_at: FUTURE }, NOW)).toBe(true) // within
    expect(bannerWithinWindow({ starts_at: null, ends_at: PAST }, NOW)).toBe(false) // ended
    expect(bannerWithinWindow({ starts_at: null, ends_at: null }, NOW)).toBe(true) // open
  })
})

describe('BannersService.getActive', () => {
  it('queries only active rows', async () => {
    const { repo, find } = makeRepo([])
    const service = new BannersService(repo)
    await service.getActive({ placement: 'app', authenticated: true, now: NOW })
    expect(find).toHaveBeenCalledWith({ where: { active: true } })
  })

  it('excludes banners outside their scheduling window (before + after)', async () => {
    const rows = [
      makeBanner({ id: 'live', starts_at: PAST, ends_at: FUTURE }),
      makeBanner({ id: 'scheduled', starts_at: FUTURE, ends_at: null }),
      makeBanner({ id: 'expired', starts_at: null, ends_at: PAST }),
    ]
    const service = new BannersService(makeRepo(rows).repo)
    const out = await service.getActive({ placement: 'app', authenticated: true, now: NOW })
    expect(out.map(b => b.id)).toEqual(['live'])
  })

  it('filters by placement (app vs website, both matches either)', async () => {
    const rows = [
      makeBanner({ id: 'app-only', placement: 'app' }),
      makeBanner({ id: 'web-only', placement: 'website' }),
      makeBanner({ id: 'both', placement: 'both' }),
    ]
    const appOut = await new BannersService(makeRepo(rows).repo).getActive({
      placement: 'app',
      authenticated: true,
      now: NOW,
    })
    expect(appOut.map(b => b.id).sort()).toEqual(['app-only', 'both'])

    const webOut = await new BannersService(makeRepo(rows).repo).getActive({
      placement: 'website',
      authenticated: true,
      now: NOW,
    })
    expect(webOut.map(b => b.id).sort()).toEqual(['both', 'web-only'])
  })

  it('hides authenticated-only banners from anonymous viewers', async () => {
    const rows = [
      makeBanner({ id: 'public', audience: 'all' }),
      makeBanner({ id: 'members', audience: 'authenticated' }),
    ]
    const anon = await new BannersService(makeRepo(rows).repo).getActive({
      placement: 'app',
      authenticated: false,
      now: NOW,
    })
    expect(anon.map(b => b.id)).toEqual(['public'])

    const authed = await new BannersService(makeRepo(rows).repo).getActive({
      placement: 'app',
      authenticated: true,
      now: NOW,
    })
    expect(authed.map(b => b.id).sort()).toEqual(['members', 'public'])
  })

  it('orders by priority desc, then oldest-first among ties', async () => {
    const rows = [
      makeBanner({ id: 'low', priority: 1 }),
      makeBanner({ id: 'high', priority: 9 }),
      makeBanner({ id: 'mid-new', priority: 5, created_at: new Date('2026-03-02T00:00:00.000Z') }),
      makeBanner({ id: 'mid-old', priority: 5, created_at: new Date('2026-03-01T00:00:00.000Z') }),
    ]
    const out = await new BannersService(makeRepo(rows).repo).getActive({
      placement: 'app',
      authenticated: true,
      now: NOW,
    })
    expect(out.map(b => b.id)).toEqual(['high', 'mid-old', 'mid-new', 'low'])
  })

  it('maps a complete CTA and omits an incomplete one', async () => {
    const rows = [
      makeBanner({ id: 'with-cta', cta_url: 'https://bellum-ai.com', cta_label_fr: 'Voir', cta_label_en: 'See' }),
      makeBanner({ id: 'partial-cta', cta_url: 'https://bellum-ai.com', cta_label_fr: 'Voir', cta_label_en: null }),
    ]
    const out = await new BannersService(makeRepo(rows).repo).getActive({
      placement: 'app',
      authenticated: true,
      now: NOW,
    })
    const withCta = out.find(b => b.id === 'with-cta')
    const partial = out.find(b => b.id === 'partial-cta')
    expect(withCta?.cta).toEqual({ label: { fr: 'Voir', en: 'See' }, url: 'https://bellum-ai.com' })
    expect(partial?.cta).toBeNull()
  })
})

describe('BannersService CRUD', () => {
  const baseDto = {
    kind: 'offer',
    variant: 'success',
    titleFr: 'Offre',
    titleEn: 'Offer',
    bodyFr: 'corps',
    bodyEn: 'body',
    placement: 'both',
    audience: 'all',
    dismissible: true,
    priority: 3,
    active: true,
  } as unknown as CreateBanner

  it('create: stamps version 1 and created_by, maps dates', async () => {
    const { repo, create, save } = makeRepo()
    const service = new BannersService(repo)
    const dto = { ...baseDto, startsAt: '2026-07-18T00:00:00.000Z', endsAt: '2026-07-30T00:00:00.000Z' } as CreateBanner
    const out = await service.create(dto, 'operator')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 1, created_by: 'operator' }))
    expect(save).toHaveBeenCalled()
    expect(out.version).toBe(1)
    expect(out.startsAt).toBe('2026-07-18T00:00:00.000Z')
    expect(out.endsAt).toBe('2026-07-30T00:00:00.000Z')
    expect(out.placement).toBe('both')
  })

  it('update: bumps version and only touches provided fields', async () => {
    const existing = makeBanner({ id: 'b9', version: 2, title_fr: 'Ancien', title_en: 'Old', priority: 0 })
    const { repo, findOne } = makeRepo()
    findOne.mockResolvedValue(existing)
    const service = new BannersService(repo)
    const out = await service.update('b9', { titleFr: 'Nouveau', priority: 7 } as UpdateBanner)
    expect(out.version).toBe(3)
    expect(out.titleFr).toBe('Nouveau')
    expect(out.titleEn).toBe('Old') // untouched
    expect(out.priority).toBe(7)
  })

  it('update: throws NotFound when the banner is missing', async () => {
    const { repo, findOne } = makeRepo()
    findOne.mockResolvedValue(null)
    await expect(new BannersService(repo).update('nope', {} as UpdateBanner)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('toggle: flips active and bumps version', async () => {
    const existing = makeBanner({ id: 'b5', active: true, version: 4 })
    const { repo, findOne } = makeRepo()
    findOne.mockResolvedValue(existing)
    const out = await new BannersService(repo).toggle('b5', false)
    expect(out.active).toBe(false)
    expect(out.version).toBe(5)
  })

  it('remove: throws NotFound when nothing was deleted', async () => {
    const { repo, del } = makeRepo()
    del.mockResolvedValue({ affected: 0 })
    await expect(new BannersService(repo).remove('ghost')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('list: returns admin shape ordered by the repo query', async () => {
    const rows = [makeBanner({ id: 'a', priority: 5 }), makeBanner({ id: 'b', priority: 1 })]
    const { repo, find } = makeRepo(rows)
    const out = await new BannersService(repo).list()
    expect(find).toHaveBeenCalledWith({ order: { priority: 'DESC', created_at: 'DESC' } })
    expect(out.map(b => b.id)).toEqual(['a', 'b'])
    expect(out[0]).toHaveProperty('createdBy')
    expect(out[0]).toHaveProperty('active')
  })
})
