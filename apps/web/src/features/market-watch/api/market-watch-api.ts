import type { MarketWatch } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export async function fetchMarketWatch(): Promise<MarketWatch> {
  return apiFetch<MarketWatch>({ path: '/pilotage/marche' })
}

export async function followTerritory(department: string): Promise<{ department: string }> {
  return apiFetch<{ department: string }>({ path: '/pilotage/marche', method: 'POST', body: { department } })
}

export async function unfollowTerritory(department: string): Promise<{ department: string }> {
  return apiFetch<{ department: string }>({
    path: `/pilotage/marche/${encodeURIComponent(department)}`,
    method: 'DELETE',
  })
}
