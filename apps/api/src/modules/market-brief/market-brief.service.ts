import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { marketBriefSchema, type MarketBrief } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { MarketZoneEntity } from '../../database/entities/market-zone.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SiteEntity } from '../../database/entities/site.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { MAX_ZONES_PER_WORKSPACE, type CreateMarketZone } from './market-brief.dto'
import { buildPriceGrid, type DeterministicPriceGrid } from './price-grid'
import { linkAccountsToZone, type LinkedAccount } from './zone-accounts'

/**
 * Capacité « Marchés locaux » (L1) — zones d'un espace et lecture de leur brief.
 * Module autonome (Craft rule #7) : espace résolu depuis le TOKEN par l'appelant,
 * chaque lecture scopée à `ctx.workspaceId` (GA-43). Aucune génération ici (lot L3).
 */
export type MarketZoneCtx = { readonly userId: string; readonly workspaceId: string }

type MarketZoneListItem = {
  id: string
  slug: string
  label: string
  scope: 'france' | 'suisse'
  has_brief: boolean
  brief_generated_at: string | null
}

type MarketZoneDetail = {
  id: string
  slug: string
  label: string
  scope: 'france' | 'suisse'
  departments: string[]
  cantons: string[]
  cities: string[]
  brief: MarketBrief | null
  /** Un brief stocké qui ne passe plus le contrat n'est JAMAIS servi à moitié. */
  brief_invalid: boolean
  brief_origin: 'seed' | 'generated' | null
  brief_generated_at: string | null
  linked_accounts: LinkedAccount[]
}

const slugify = (label: string): string => {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'zone' : slug
}

@Injectable()
export class MarketBriefService {
  constructor(
    @InjectRepository(MarketZoneEntity) private readonly zones: Repository<MarketZoneEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(SiteEntity) private readonly sites: Repository<SiteEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
  ) {}

  private async zoneOf(ctx: MarketZoneCtx, id: string): Promise<MarketZoneEntity> {
    const row = await this.zones.findOne({ where: { id, ...workspaceScopeWhere(ctx.workspaceId) } })
    if (!row) throw new NotFoundException('Zone introuvable dans cet espace.')
    return row
  }

  async list(ctx: MarketZoneCtx): Promise<MarketZoneListItem[]> {
    const rows = await this.zones.find({ where: workspaceScopeWhere(ctx.workspaceId), order: { label: 'ASC' } })
    return rows.map(row => ({
      id: row.id,
      slug: row.slug,
      label: row.label,
      scope: row.scope,
      has_brief: row.brief !== null && row.brief !== undefined,
      brief_generated_at: row.brief_generated_at ? new Date(row.brief_generated_at).toISOString() : null,
    }))
  }

  async get(ctx: MarketZoneCtx, id: string): Promise<MarketZoneDetail> {
    const row = await this.zoneOf(ctx, id)
    const parsed = row.brief === null || row.brief === undefined ? null : marketBriefSchema.safeParse(row.brief)
    const brief = parsed?.success ? parsed.data : null
    const geo = { scope: row.scope, departments: row.departments, cantons: row.cantons, cities: row.cities }
    const [accounts, sites] = await Promise.all([
      this.accounts.find({
        where: workspaceScopeWhere(ctx.workspaceId),
        select: { id: true, company_name: true, headquarters: true },
      }),
      this.sites.find({
        where: workspaceScopeWhere(ctx.workspaceId),
        select: { account_id: true, city: true, postal_code: true },
      }),
    ])
    return {
      id: row.id,
      slug: row.slug,
      label: row.label,
      scope: row.scope,
      departments: row.departments,
      cantons: row.cantons,
      cities: row.cities,
      brief,
      brief_invalid: parsed !== null && !parsed.success,
      brief_origin: row.brief_origin,
      brief_generated_at: row.brief_generated_at ? new Date(row.brief_generated_at).toISOString() : null,
      linked_accounts: linkAccountsToZone({
        zone: geo,
        accounts: accounts.map(a => ({ id: a.id, name: a.company_name, headquarters: a.headquarters })),
        sites,
        brief,
      }),
    }
  }

  async create(ctx: MarketZoneCtx, dto: CreateMarketZone): Promise<MarketZoneListItem> {
    const existing = await this.zones.find({
      where: workspaceScopeWhere(ctx.workspaceId),
      select: { id: true, slug: true },
    })
    if (existing.length >= MAX_ZONES_PER_WORKSPACE) {
      throw new BadRequestException(`Un espace porte au plus ${MAX_ZONES_PER_WORKSPACE} zones.`)
    }
    const taken = new Set(existing.map(z => z.slug))
    const base = slugify(dto.label)
    let slug = base
    for (let i = 2; taken.has(slug); i += 1) slug = `${base}-${i}`
    const saved = await this.zones.save(
      this.zones.create({
        workspace_id: ctx.workspaceId,
        slug,
        label: dto.label,
        scope: dto.scope,
        departments: dto.departments,
        cantons: dto.cantons,
        cities: dto.cities,
        created_by: ctx.userId,
      }),
    )
    return {
      id: saved.id,
      slug: saved.slug,
      label: saved.label,
      scope: saved.scope,
      has_brief: false,
      brief_generated_at: null,
    }
  }

  async remove(ctx: MarketZoneCtx, id: string): Promise<{ deleted: true }> {
    const row = await this.zoneOf(ctx, id)
    await this.zones.delete({ id: row.id, ...workspaceScopeWhere(ctx.workspaceId) })
    return { deleted: true }
  }

  /**
   * La grille de prix déterministe d'une zone, calculée sur les besoins et missions
   * de l'espace SEUL. Utilisée par la génération (lot L3) ; `null` = rien de publiable.
   */
  async priceGridFor(ctx: MarketZoneCtx, id: string, now: Date = new Date()): Promise<DeterministicPriceGrid | null> {
    const row = await this.zoneOf(ctx, id)
    const scope = workspaceScopeWhere(ctx.workspaceId)
    const [needs, missions, accounts] = await Promise.all([
      this.needs.find({
        where: scope,
        select: { title: true, seniority: true, target_tjm_cents: true, location: true, account_id: true },
      }),
      this.missions.find({
        where: scope,
        select: { role_title: true, daily_rate: true, location: true, account_id: true },
      }),
      this.accounts.find({ where: scope, select: { id: true, company_name: true } }),
    ])
    return buildPriceGrid({
      zone: { scope: row.scope, departments: row.departments, cantons: row.cantons, cities: row.cities },
      needs,
      missions,
      accountNames: new Map(accounts.map(a => [a.id, a.company_name])),
      period: `Besoins et missions de l'espace au ${now.toISOString().slice(0, 10)}`,
    })
  }
}
