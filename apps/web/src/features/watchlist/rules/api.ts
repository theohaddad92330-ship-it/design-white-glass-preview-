import type { CreateWatchlistRuleInput, WatchlistRule } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Thin client over the NestJS `/watchlist/rules` module (règles de veille §11). */
export const watchlistRulesApi = {
  list(): Promise<WatchlistRule[]> {
    return apiFetch<WatchlistRule[]>({ path: '/watchlist/rules' })
  },
  create(input: CreateWatchlistRuleInput): Promise<WatchlistRule> {
    return apiFetch<WatchlistRule>({ path: '/watchlist/rules', method: 'POST', body: input })
  },
  remove(id: string): Promise<void> {
    return apiFetch<void>({ path: `/watchlist/rules/${id}`, method: 'DELETE' })
  },
}
