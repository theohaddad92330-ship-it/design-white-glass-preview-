import { Injectable } from '@nestjs/common'
import { MarketSignalsReader, type MarketCompanyLookup } from '../market-memory/market-signals-reader'
import type { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import {
  buildOpportunities,
  parseSkills,
  type MarketCandidate,
  type Opportunity,
  type PortfolioCandidate,
} from './mcp-opportunities'

type BusinessUnitScope = Awaited<ReturnType<typeof resolveBusinessUnitScope>>

interface PortfolioRow {
  id: string
  company_name: string
  website?: string | null
  priority_score?: number | null
  primary_signal?: string | null
  signal_freshness?: { state: PortfolioCandidate['signal_freshness'] } | null
  next_action_label?: string | null
}

/**
 * Le portefeuille de l'espace, LU PAR LE CONTRÔLEUR (cloisonnement déjà
 * appliqué) : le service ne dépend pas du module des comptes (GA-07).
 */
type ListPortfolio = (filters: { q?: string; limit: number }) => Promise<{ data?: PortfolioRow[] }>

interface McpSignalsContext {
  workspaceId: string
  businessUnitScope: BusinessUnitScope
  listPortfolio: ListPortfolio
}

interface OpportunityFilters {
  q?: string
  skills?: string
  inPortfolio?: boolean
  limit?: number
}

/** Le portefeuille lu d'un coup : l'agrégat porte sur tout, ou sur rien. */
const PORTFOLIO_READ_LIMIT = 100
const MARKET_READ_LIMIT = 50

const ACCOUNT_ROUTE = /^\/accounts\/(.+)$/

/**
 * Surface « signaux → opportunités » du MCP. Ne fait que LIRE : le portefeuille
 * de l'espace (cloisonné) et la mémoire marché, jamais d'écriture dans `accounts`.
 * Le rattachement d'une entreprise du marché à un compte passe par la clé
 * RÉSOLUE (domaine / décision humaine) de la mémoire marché — jamais par le nom.
 */
@Injectable()
export class McpSignalsService {
  constructor(private readonly market: MarketSignalsReader) {}

  async findOpportunities(
    ctx: McpSignalsContext,
    filters: OpportunityFilters,
  ): Promise<{ items: Opportunity[]; market_memory: 'ok' | 'indisponible' }> {
    const skills = parseSkills(filters.skills)
    const list = await ctx.listPortfolio({ limit: PORTFOLIO_READ_LIMIT })
    const rows = list.data ?? []
    const portfolio: PortfolioCandidate[] = rows.map(row => ({
      account_id: row.id,
      company_name: row.company_name,
      priority_score: row.priority_score ?? null,
      primary_signal: row.primary_signal ?? null,
      signal_freshness: row.signal_freshness?.state ?? null,
      next_action_label: row.next_action_label ?? null,
    }))
    const lookups: MarketCompanyLookup[] = rows.map(row => ({
      ref: row.id,
      name: row.company_name,
      website: row.website ?? null,
    }))

    const { candidates, available } = await this.readMarket(ctx, skills, lookups)
    return {
      items: buildOpportunities({
        portfolio,
        market: candidates,
        skills,
        q: filters.q,
        inPortfolio: filters.inPortfolio,
        limit: filters.limit,
      }),
      market_memory: available ? 'ok' : 'indisponible',
    }
  }

  private async readMarket(
    ctx: McpSignalsContext,
    skills: readonly string[],
    lookups: readonly MarketCompanyLookup[],
  ): Promise<{ candidates: MarketCandidate[]; available: boolean }> {
    const options = { portfolio: lookups, workspaceId: ctx.workspaceId }
    const searches =
      skills.length > 0
        ? skills.map(technology => ({ technology, limit: MARKET_READ_LIMIT }))
        : [{ externalRecourseObserved: true, limit: MARKET_READ_LIMIT }]
    const reads = await Promise.all(searches.map(filters => this.market.searchByFilters(filters, options)))

    const byName = new Map<string, MarketCandidate>()
    let available = true
    for (const read of reads) {
      if (read.status !== 'ok') {
        available = false
        continue
      }
      for (const match of read.matches) {
        const accountId = ACCOUNT_ROUTE.exec(match.accountRoute ?? '')?.[1] ?? null
        const key = accountId ?? match.companyName.toLowerCase()
        const stack = match.coverage.observedStack.map(entry => entry.techno)
        const previous = byName.get(key)
        byName.set(key, {
          company_name: match.companyName,
          account_id: accountId,
          external_recourse: match.coverage.esnObserved.length > 0,
          observed_stack: [...new Set([...(previous?.observed_stack ?? []), ...stack])],
          role_families: match.coverage.roleFamilies.map(entry => entry.family),
          market_paths: match.coverage.marketPaths ?? 0,
        })
      }
    }
    return { candidates: [...byName.values()], available }
  }

  /** Signaux marché d'UNE entreprise, même hors portefeuille. */
  async marketSignals(ctx: McpSignalsContext, keyOrName: string) {
    const name = keyOrName.trim()
    const lookup: MarketCompanyLookup = { ref: 'query', name }
    const resolution = await this.market.resolveDetailed(lookup)
    const read = await this.market.coverageFor(lookup)
    if (read.status !== 'ok') return { status: 'indisponible' as const, company_name: name }

    const accountId =
      resolution.status === 'resolved' ? await this.linkedAccount(ctx, name, resolution.companyKey) : null
    const coverage = read.coverage
    if (!coverage.covered) {
      return {
        status: 'ok' as const,
        company_name: name,
        covered: false,
        account_id: accountId,
        external_recourse: null,
        observed_stack: null,
        role_families: null,
      }
    }
    return {
      status: 'ok' as const,
      company_name: name,
      covered: true,
      account_id: accountId,
      external_recourse: coverage.esnObserved.length > 0,
      observed_stack: coverage.observedStack.map(entry => entry.techno),
      role_families: coverage.roleFamilies.map(entry => entry.family),
      next_step:
        accountId === null
          ? 'Lancer une analyse pour obtenir contacts, angles d’attaque et plan (devis de crédits d’abord).'
          : 'Ouvrir le dossier du compte et préparer la prise de contact.',
    }
  }

  /** Le compte du portefeuille dont la clé résolue est CELLE de l'entreprise — jamais le nom seul. */
  private async linkedAccount(ctx: McpSignalsContext, name: string, companyKey: string): Promise<string | null> {
    const list = await ctx.listPortfolio({ q: name, limit: 10 })
    for (const row of list.data ?? []) {
      const resolved = await this.market.resolveDetailed({
        ref: row.id,
        name: row.company_name,
        website: row.website ?? null,
      })
      if (resolved.status === 'resolved' && resolved.companyKey === companyKey) return row.id
    }
    return null
  }
}
