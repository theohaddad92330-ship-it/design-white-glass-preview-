import { useQuery } from '@tanstack/react-query'
import type { SignalRecurrence } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

const NONE: Readonly<Record<string, SignalRecurrence>> = Object.freeze({})
const KINDS: ReadonlySet<string> = new Set(['hiring', 'need', 'signal'])

/** Une entrée illisible, ou qui n'est pas une récurrence (< 2), n'est pas lue : jamais « 0 », jamais « 1 ». */
function readRecurrences(raw: unknown): Record<string, SignalRecurrence> {
  const source = (raw as { recurrences?: unknown } | null)?.recurrences
  if (!source || typeof source !== 'object') return {}
  const out: Record<string, SignalRecurrence> = {}
  for (const [accountId, value] of Object.entries(source)) {
    const v = value as Partial<SignalRecurrence> | null
    if (v && typeof v.kind === 'string' && KINDS.has(v.kind) && Number.isFinite(v.count) && (v.count as number) >= 2) {
      out[accountId] = { kind: v.kind, count: v.count as number, windowDays: v.windowDays ?? 30 }
    }
  }
  return out
}

/**
 * #4072.4 — la récurrence d'un signal pour TOUTES les cibles affichées, en UNE requête
 * (`GET /account-facts/recurrence`, lecteur par lot), jamais une par ligne. Une lecture en échec rend
 * un objet vide : la Watchlist n'invente rien à la place.
 */
export function useSignalRecurrences(accountIds: readonly string[]): Readonly<Record<string, SignalRecurrence>> {
  const { user } = useSession()
  const ids = [...new Set(accountIds)].sort()
  const { data } = useQuery<Record<string, SignalRecurrence>>({
    queryKey: ['account-facts', 'recurrence', ids],
    queryFn: async () =>
      readRecurrences(await apiFetch<unknown>({ path: `/account-facts/recurrence?ids=${ids.join(',')}` })),
    enabled: ids.length > 0 && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return data ?? NONE
}
