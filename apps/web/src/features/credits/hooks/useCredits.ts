import { useQuery } from '@tanstack/react-query'
import { saveQuerySnapshot } from '@/lib/cache/idb/query-snapshots'
import { creditsApi } from '@/features/credits/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Returns the authenticated user's credits.
 *
 * `data` is `undefined` until the balance is actually known — deliberately NOT
 * back-filled with defaults. This hook used to serve a `placeholderData` of
 * `{ plan: 'trial', accounts_limit: 40, enrichment_credits: 75 }`, a fabricated
 * business claim rather than a neutral placeholder. It quoted « 40 crédits » to
 * every user whatever their plan, and labelled a paying Growth customer
 * « Essai gratuit ».
 *
 * The nasty part was that `placeholderData` flips `status` to `'success'`, so
 * `isLoading` is already `false` while the invented numbers are on screen —
 * every downstream `isLoading` guard was silently a no-op (see the dead guard
 * that used to sit in `Search.tsx`'s pre-launch cost note).
 *
 * On ERROR the placeholder is NOT served (query-core requires
 * `status === 'pending'`), so `data` is `undefined` there — which is precisely
 * why the `billing/hooks/useCredits` adapter must not substitute defaults of
 * its own either. Both fabrication paths are now gone.
 *
 * Callers must handle `undefined` and render an explicit "unknown" state —
 * never a zero, never a plausible number. See `CreditsBadge`.
 */
export function useCredits() {
  const { user } = useSession()
  const queryKey = ['credits', user?.id] as const
  return useQuery({
    queryKey,
    queryFn: async () => {
      const data = await creditsApi.getMine()
      void saveQuerySnapshot(queryKey, data)
      return data
    },
    enabled: !!user,
    staleTime: 60_000,
  })
}
