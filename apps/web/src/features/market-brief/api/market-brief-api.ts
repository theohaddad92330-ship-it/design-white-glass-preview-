import type { MarketBrief } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Lecture des zones « Marchés locaux » (L1) — miroir de la réponse de `GET /market-zones[/:id]`. */
type MarketZoneListItem = {
  id: string
  slug: string
  label: string
  scope: 'france' | 'suisse'
  has_brief: boolean
  brief_generated_at: string | null
}

type MarketZoneLinkedAccount = {
  account_id: string
  name: string
  match: 'site' | 'headquarters' | 'named_in_brief'
}

export type MarketZoneDetail = {
  id: string
  slug: string
  label: string
  scope: 'france' | 'suisse'
  departments: string[]
  cantons: string[]
  cities: string[]
  brief: MarketBrief | null
  /** Un brief stocké qui ne passe plus le contrat n'est jamais servi à moitié. */
  brief_invalid: boolean
  brief_origin: 'seed' | 'generated' | null
  brief_generated_at: string | null
  linked_accounts: MarketZoneLinkedAccount[]
}

export async function listMarketZones(): Promise<MarketZoneListItem[]> {
  return apiFetch<MarketZoneListItem[]>({ path: '/market-zones' })
}

export async function getMarketZone(id: string): Promise<MarketZoneDetail> {
  return apiFetch<MarketZoneDetail>({ path: `/market-zones/${encodeURIComponent(id)}` })
}

/**
 * #3828.2 — créer une zone (`POST /market-zones` existait déjà côté API,
 * `MarketBriefController.create` ; rien côté web ne l'appelait — c'est ce qui
 * laisse `/api/market-zones` renvoyer `[]` dans un espace réel, et donc la
 * puce « Marché local » n'apparaître nulle part. La forme suit le contrat
 * (`createMarketZoneSchema`, GA-26) : `departments`/`cantons`/`cities` sont
 * optionnels côté client, le serveur les défaut à `[]`.
 */
export async function createMarketZone(input: {
  label: string
  scope: 'france' | 'suisse'
  departments?: string[]
  cantons?: string[]
  cities?: string[]
}): Promise<MarketZoneListItem> {
  return apiFetch<MarketZoneListItem>({ path: '/market-zones', method: 'POST', body: input })
}
