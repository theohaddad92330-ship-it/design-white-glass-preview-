import { useCallback, useEffect, useState } from 'react'
import { normalizeMarket, type WorkspaceMarket } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspaceMarket } from '@/features/team/hooks/useWorkspaceMarket'

/**
 * The target market (country) of the SEARCH BAR — recherche multi-pays #494.
 *
 * This is deliberately distinct from the team-wide `useWorkspaceMarket` setting:
 * a commercial can point a single search at another country (e.g. look up
 * « Apple Inc » in the US from an FR workspace) WITHOUT changing the workspace
 * default. The value drives both the autocomplete source and the country handed
 * to the analysis launch.
 *
 * Resolution order:
 *  1. a remembered per-user override in `localStorage` (the last flag the user
 *     picked), if it is still a valid market;
 *  2. otherwise the workspace's own market (so the bar defaults to the team's
 *     country out of the box);
 *  3. `FR` while the workspace market is still loading — the strictly-unchanged
 *     French default, so nothing regresses before the real default arrives.
 *
 * The override is keyed by user id (the stable client-side handle for "this
 * user's active workspace"; the browser never holds a workspace id) so two
 * accounts on the same machine don't clobber each other's choice.
 */
const STORAGE_PREFIX = 'bellum:search-country:'

function readStored(userId: string | null): WorkspaceMarket | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId)
    if (!raw) return null
    const normalized = normalizeMarket(raw)
    // `normalizeMarket` falls back to FR on an unknown value; only treat the
    // stored value as an override when it round-trips to itself.
    return normalized === raw ? normalized : null
  } catch {
    return null
  }
}

export function useSearchCountry(): { country: WorkspaceMarket; setCountry: (next: WorkspaceMarket) => void } {
  const { user } = useSession()
  const userId = user?.id ?? null
  const { market } = useWorkspaceMarket()
  const workspaceDefault = market?.market ?? 'FR'

  // Lazy init from storage; falls back to FR until the workspace market loads
  // (see the effect below, which seeds the workspace default when there is no
  // remembered override).
  const [country, setCountryState] = useState<WorkspaceMarket>(() => readStored(userId) ?? 'FR')
  const [userTouched, setUserTouched] = useState<boolean>(() => readStored(userId) !== null)

  // Seed the workspace default once it resolves — but never override an explicit
  // user choice (remembered or made this session).
  useEffect(() => {
    if (!userTouched) setCountryState(workspaceDefault)
  }, [workspaceDefault, userTouched])

  // Re-hydrate the remembered override when the signed-in user changes.
  useEffect(() => {
    const stored = readStored(userId)
    if (stored) {
      setCountryState(stored)
      setUserTouched(true)
    } else {
      setUserTouched(false)
    }
  }, [userId])

  const setCountry = useCallback(
    (next: WorkspaceMarket) => {
      setCountryState(next)
      setUserTouched(true)
      if (userId && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_PREFIX + userId, next)
        } catch {
          // A full / disabled storage must never break the selector.
        }
      }
    },
    [userId],
  )

  return { country, setCountry }
}
