import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { analysisGeoPerimeterSchema, analysisScopeModeSchema, type Account } from '@bellum/contracts'

/** Le périmètre de la dernière analyse, tel que la confirmation d'actualisation le lit. */
export type RelaunchScope = {
  scopeMode?: string | null
  geoPerimeter?: string | null
  geoAreas?: readonly string[] | null
}

function readScope(value: unknown): RelaunchScope {
  return typeof value === 'object' && value !== null ? (value as RelaunchScope) : {}
}

/**
 * Sends the user to the search page pre-filled to re-analyse the account.
 *
 * #3742 / #3744 — the optional scope carries the LAST analysis' perimeter into
 * the search draft: the scope chip (`scope`) AND the geographic zone typed at
 * framing (`geo` + `geoAreas`), so a refresh keeps « France » instead of
 * silently falling back to the default. Anything unknown — including a click
 * event when used as a bare `onClick` — adds nothing.
 */
export function useAccountRelaunch(account: Pick<Account, 'id' | 'company_name'>): {
  relaunch: (scope?: unknown) => void
} {
  const navigate = useNavigate()
  const relaunch = useCallback(
    (scope?: unknown) => {
      const { scopeMode, geoPerimeter, geoAreas } = readScope(scope)
      const mode = analysisScopeModeSchema.safeParse(scopeMode)
      const geo = analysisGeoPerimeterSchema.safeParse(geoPerimeter)
      const areas = Array.isArray(geoAreas)
        ? geoAreas.filter((area): area is string => typeof area === 'string' && area.trim().length > 0)
        : []
      navigate({
        to: '/search',
        search: {
          accountId: account.id,
          company: account.company_name || '',
          ...(mode.success ? { scope: mode.data } : {}),
          ...(geo.success ? { geo: geo.data } : {}),
          ...(geo.success && areas.length > 0 ? { geoAreas: areas } : {}),
        },
      })
    },
    [account.id, account.company_name, navigate],
  )
  return { relaunch }
}
