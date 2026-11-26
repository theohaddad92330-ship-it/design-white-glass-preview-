import type { ActionPlanItem } from '@bellum/contracts'
import { PLAN_ITEMS_LAST_OUTCOMES_MAX_ACCOUNTS } from '@bellum/contracts'
import { planItemsApi } from '@/features/actions/planItems.api'

type Waiter = { resolve: (item: ActionPlanItem | null) => void; reject: (error: unknown) => void }

/**
 * Regroupe les lectures « dernier résultat d'un compte » demandées dans le même instant (une ligne de
 * compte du briefing = une demande) en UN `GET /plan-items/last-outcomes`. Sans lui, chaque ligne
 * appelait `GET /plan-items?account_id=` : N appels en rafale sur /briefing (Sentry BELLUM-WEB-1).
 * Un compte sans issue résout `null` — jamais une ligne inventée.
 */
export function createLastOutcomeBatcher(
  fetchMany: (accountIds: readonly string[]) => Promise<ActionPlanItem[]> = ids => planItemsApi.lastOutcomes(ids),
  windowMs = 10,
) {
  let pending = new Map<string, Waiter[]>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = async () => {
    const batch = pending
    pending = new Map()
    timer = null
    const ids = [...batch.keys()]
    for (let i = 0; i < ids.length; i += PLAN_ITEMS_LAST_OUTCOMES_MAX_ACCOUNTS) {
      const chunk = ids.slice(i, i + PLAN_ITEMS_LAST_OUTCOMES_MAX_ACCOUNTS)
      try {
        const rows = await fetchMany(chunk)
        const byAccount = new Map(rows.flatMap(row => (row.account_id ? [[row.account_id, row] as const] : [])))
        for (const id of chunk) for (const w of batch.get(id) ?? []) w.resolve(byAccount.get(id) ?? null)
      } catch (error) {
        for (const id of chunk) for (const w of batch.get(id) ?? []) w.reject(error)
      }
    }
  }

  return {
    load(accountId: string): Promise<ActionPlanItem | null> {
      return new Promise((resolve, reject) => {
        const waiters = pending.get(accountId) ?? []
        waiters.push({ resolve, reject })
        pending.set(accountId, waiters)
        timer ??= setTimeout(() => void flush(), windowMs)
      })
    },
  }
}

export const lastOutcomeBatcher = createLastOutcomeBatcher()
