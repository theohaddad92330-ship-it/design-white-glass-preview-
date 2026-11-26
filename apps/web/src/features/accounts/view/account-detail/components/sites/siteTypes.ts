import { accountKeys } from '@/features/accounts/api'
import type { SiteCategory } from './siteStyles'

export type RawBranch = {
  city?: string | null
  postal_code?: string | null
  latitude?: number | null
  longitude?: number | null
  is_headquarters?: boolean | null
}

export type SiteRow = {
  city: string
  region?: string | null
  type?: string | null
  priority?: 'haute' | 'moyenne' | 'basse' | string | null
  latitude?: number | null
  longitude?: number | null
  is_headquarters?: boolean
  /** #2966 (#2119.57) — `registry` : le registre légal (Pappers), un fait
   *  établi. `inferred` : lu par le modèle (presse, site, LinkedIn…), une
   *  présence historique JAMAIS présentée comme un établissement officiel.
   *  Absent uniquement sur une fixture de test qui ne fait pas transiter la
   *  ligne par `normaliseBranches`/`normaliseClaudeSites`. */
  source?: 'registry' | 'inferred'
  /** #4326 — nombre d'établissements du registre regroupés dans cette ville. */
  establishments?: number
}

export type RegionStat = {
  name: string
  count: number
  percent: number
}

export type SiteTypeStat = {
  label: string
  count: number
  /** La catégorie elle-même, plus un « ton » sémantique : la pastille se
   *  dérive de la catégorie au même endroit que la carte (`siteStyles`), au
   *  lieu de porter un `success` qui ne voulait rien dire ici. */
  category: SiteCategory
}

export const BRANCH_PAGE_SIZE = 50

export const branchesPageKey = (accountId: string, page: number, pageSize: number) =>
  [...accountKeys.detail(accountId), 'branches', { page, pageSize }] as const
