import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  AdminBanner,
  BannerAudience,
  BannerKind,
  BannerPlacement,
  BannerVariant,
  BannerViewerPlacement,
  CreateBanner,
  PublicBanner,
  UpdateBanner,
} from '@bellum/contracts'
import { BannerEntity } from '../../database/entities/banner.entity'

/* ── Pure visibility predicates (exported for direct unit testing) ─────────── */

/** A banner shows on `viewer` when its placement is that surface or `both`. */
export function bannerMatchesPlacement(placement: string, viewer: BannerViewerPlacement): boolean {
  return placement === viewer || placement === 'both'
}

/** `all` shows to everyone; `authenticated` only to signed-in viewers. */
export function bannerMatchesAudience(audience: string, authenticated: boolean): boolean {
  return audience === 'all' || (audience === 'authenticated' && authenticated)
}

/** `now` is within `[starts_at, ends_at]` — a null bound means "open". */
export function bannerWithinWindow(banner: { starts_at: Date | null; ends_at: Date | null }, now: Date): boolean {
  const t = now.getTime()
  if (banner.starts_at && new Date(banner.starts_at).getTime() > t) return false
  if (banner.ends_at && new Date(banner.ends_at).getTime() < t) return false
  return true
}

/* ── Entity ⇄ wire mapping ────────────────────────────────────────────────── */

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toAdminBanner(e: BannerEntity): AdminBanner {
  return {
    id: e.id,
    kind: e.kind as BannerKind,
    variant: e.variant as BannerVariant,
    titleFr: e.title_fr,
    titleEn: e.title_en,
    bodyFr: e.body_fr,
    bodyEn: e.body_en,
    ctaLabelFr: e.cta_label_fr,
    ctaLabelEn: e.cta_label_en,
    ctaUrl: e.cta_url,
    placement: e.placement as BannerPlacement,
    audience: e.audience as BannerAudience,
    startsAt: toIso(e.starts_at),
    endsAt: toIso(e.ends_at),
    dismissible: e.dismissible,
    priority: e.priority,
    active: e.active,
    version: e.version,
    createdBy: e.created_by,
    createdAt: toIso(e.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(e.updated_at) ?? new Date(0).toISOString(),
  }
}

function toPublicBanner(e: BannerEntity): PublicBanner {
  const hasCta = !!e.cta_url && !!e.cta_label_fr && !!e.cta_label_en
  return {
    id: e.id,
    kind: e.kind as BannerKind,
    variant: e.variant as BannerVariant,
    title: { fr: e.title_fr, en: e.title_en },
    body: { fr: e.body_fr, en: e.body_en },
    cta: hasCta
      ? { label: { fr: e.cta_label_fr as string, en: e.cta_label_en as string }, url: e.cta_url as string }
      : null,
    dismissible: e.dismissible,
    priority: e.priority,
    version: e.version,
  }
}

/** Build a partial entity from a (possibly partial) write DTO — only fields the
 *  caller actually provided are touched, so a PATCH never nulls a NOT NULL
 *  column, and an explicit `null` on an optional field clears it. */
function buildEntityPatch(dto: Partial<CreateBanner & UpdateBanner>): Partial<BannerEntity> {
  const p: Partial<BannerEntity> = {}
  if (dto.kind !== undefined) p.kind = dto.kind
  if (dto.variant !== undefined) p.variant = dto.variant
  if (dto.titleFr !== undefined) p.title_fr = dto.titleFr
  if (dto.titleEn !== undefined) p.title_en = dto.titleEn
  if (dto.bodyFr !== undefined) p.body_fr = dto.bodyFr
  if (dto.bodyEn !== undefined) p.body_en = dto.bodyEn
  if (dto.ctaLabelFr !== undefined) p.cta_label_fr = dto.ctaLabelFr ?? null
  if (dto.ctaLabelEn !== undefined) p.cta_label_en = dto.ctaLabelEn ?? null
  if (dto.ctaUrl !== undefined) p.cta_url = dto.ctaUrl ?? null
  if (dto.placement !== undefined) p.placement = dto.placement
  if (dto.audience !== undefined) p.audience = dto.audience
  if (dto.startsAt !== undefined) p.starts_at = dto.startsAt ? new Date(dto.startsAt) : null
  if (dto.endsAt !== undefined) p.ends_at = dto.endsAt ? new Date(dto.endsAt) : null
  if (dto.dismissible !== undefined) p.dismissible = dto.dismissible
  if (dto.priority !== undefined) p.priority = dto.priority
  if (dto.active !== undefined) p.active = dto.active
  return p
}

/**
 * CRUD + the hot public read for admin-scheduled banners. The public read
 * ({@link getActive}) returns ONLY currently-visible, non-sensitive rows —
 * `active` AND now within the window AND placement/audience match — ordered by
 * priority (desc), oldest-first among ties.
 */
@Injectable()
export class BannersService {
  constructor(
    @InjectRepository(BannerEntity)
    private readonly repo: Repository<BannerEntity>,
  ) {}

  /** Every banner, for the backoffice. Priority-desc, newest-first among ties. */
  async list(): Promise<AdminBanner[]> {
    const rows = await this.repo.find({ order: { priority: 'DESC', created_at: 'DESC' } })
    return rows.map(toAdminBanner)
  }

  async create(dto: CreateBanner, createdBy: string | null): Promise<AdminBanner> {
    const entity = this.repo.create({ ...buildEntityPatch(dto), version: 1, created_by: createdBy })
    const saved = await this.repo.save(entity)
    return toAdminBanner(saved)
  }

  async update(id: string, dto: UpdateBanner): Promise<AdminBanner> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Banner not found')
    Object.assign(existing, buildEntityPatch(dto))
    existing.version += 1
    const saved = await this.repo.save(existing)
    return toAdminBanner(saved)
  }

  async toggle(id: string, active: boolean): Promise<AdminBanner> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Banner not found')
    existing.active = active
    existing.version += 1
    const saved = await this.repo.save(existing)
    return toAdminBanner(saved)
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete({ id })
    if (!res.affected) throw new NotFoundException('Banner not found')
  }

  /**
   * The currently-visible public banners for a surface. Fetches the (few)
   * active rows and applies the window + placement + audience filters in JS so
   * the logic is deterministic and unit-testable, then orders by priority
   * (desc), oldest-first among equal priority.
   */
  async getActive(opts: {
    placement: BannerViewerPlacement
    authenticated: boolean
    now?: Date
  }): Promise<PublicBanner[]> {
    const now = opts.now ?? new Date()
    const rows = await this.repo.find({ where: { active: true } })
    return rows
      .filter(b => bannerMatchesPlacement(b.placement, opts.placement))
      .filter(b => bannerMatchesAudience(b.audience, opts.authenticated))
      .filter(b => bannerWithinWindow(b, now))
      .sort((a, b) => b.priority - a.priority || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(toPublicBanner)
  }
}
