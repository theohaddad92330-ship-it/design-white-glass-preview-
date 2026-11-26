import { marketMatchKey } from '../market-memory/market-company-key'
import { normalizeSiren } from '../crm/crm-deal-account-link'

/**
 * #4603 — « un compte = une société, quel que soit le chemin par lequel elle est entrée ».
 *
 * Mesuré en production le 26/10/2026 : deux fiches « Veepee » dans le même espace, l'une venue du CRM
 * (« À trier », 2 personnes), l'autre créée par l'analyse. Même famille que « 7× Decathlon »
 * (`1786000000000-PurgeEmptyDuplicateAccounts.ts`) : `findReusableFailedByUserAndCompany` ne regarde
 * que `error`/`canceled`/`prospect` et le nom exact ; le correctif d'alors traitait la relance après
 * échec, jamais l'arrivée par le CRM. Cette fonction décide, AVANT `create()`, quel compte existant
 * l'analyse reprend — quel que soit son statut.
 *
 * La clé (décision Louis 26/10/2026) : **le SIREN d'abord** — identité certaine —, **puis le nom normalisé
 * par `marketMatchKey`**, le normaliseur DÉJÀ partagé du dépôt (GA-26 : pas un second). Deux serrures :
 *  - un SIREN connu des deux côtés et DIFFÉRENT n'est jamais repris sur le nom (ROCHE ≠ ROCHE BOBOIS, GA-96) ;
 *  - plusieurs comptes de même nom portant des SIREN différents : ambigu, rien n'est repris (jamais deviné).
 * L'égalité de clé est STRICTE : « Acme » ne reprend pas « Acme Services ».
 */
export type SameCompanyCandidate = {
  id: string
  company_name: string | null
  siren: string | null
  status: string | null
  /** Au moins un `analysis_runs` existe — un `analyzing` AVEC run est un vrai run en cours. */
  has_runs: boolean
  updated_at: Date | string | null
}

type SameCompanyBasis = 'siren' | 'name'

type SameCompanyPick<T extends SameCompanyCandidate = SameCompanyCandidate> = {
  account: T
  basis: SameCompanyBasis
  /** La clé qui a décidé : le SIREN normalisé, ou la clé `marketMatchKey`. */
  key: string
}

/**
 * Un compte qui ne se reprend pas : supprimé, ou réellement en cours d'analyse (la couche d'idempotence
 * amont de `AnalysisService.start` le rejoint). Un `analyzing` SANS aucun run est la coquille d'une fiche
 * CRM créée avant le correctif (statut de colonne) — elle, se reprend.
 */
function isReusable(candidate: SameCompanyCandidate): boolean {
  if (candidate.status === 'deleted') return false
  return !(candidate.status === 'analyzing' && candidate.has_runs)
}

function recency(candidate: SameCompanyCandidate): number {
  const value = candidate.updated_at
  if (!value) return 0
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isNaN(ms) ? 0 : ms
}

/** Celui qui porte l'analyse d'abord, puis le plus récent — un ordre total, jamais le hasard d'une requête. */
function preferred<T extends SameCompanyCandidate>(rows: readonly T[]): T {
  return [...rows].sort((a, b) => Number(b.has_runs) - Number(a.has_runs) || recency(b) - recency(a))[0]
}

export function pickSameCompanyAccount<T extends SameCompanyCandidate>(
  candidates: readonly T[],
  query: { companyName: string; siren?: string | null },
): SameCompanyPick<T> | null {
  const reusable = candidates.filter(isReusable)
  const siren = normalizeSiren(query.siren)

  if (siren) {
    const bySiren = reusable.filter(candidate => normalizeSiren(candidate.siren) === siren)
    if (bySiren.length > 0) return { account: preferred(bySiren), basis: 'siren', key: siren }
  }

  const key = marketMatchKey(query.companyName)
  if (!key) return null
  const byName = reusable.filter(candidate => {
    if (marketMatchKey(candidate.company_name ?? '') !== key) return false
    const own = normalizeSiren(candidate.siren)
    return !siren || !own || own === siren
  })
  if (byName.length === 0) return null
  const sirens = new Set(byName.map(candidate => normalizeSiren(candidate.siren)).filter(Boolean))
  if (sirens.size > 1) return null
  return { account: preferred(byName), basis: 'name', key }
}

/**
 * Le mot le plus long de la clé partagée, pour RÉTRÉCIR la lecture SQL des candidats (le dossier ne
 * relit pas tout le portefeuille). Il ne décide rien : seule `pickSameCompanyAccount` tranche.
 */
export function sameCompanyPrefilterToken(companyName: string): string | null {
  const key = marketMatchKey(companyName)
  if (!key) return null
  return key.split(' ').reduce((longest, token) => (token.length > longest.length ? token : longest), '') || null
}
