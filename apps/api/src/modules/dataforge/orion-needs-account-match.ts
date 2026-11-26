import { normalizeAccountName } from '../crm/crm-duplicates'
import { marketMatchKey } from '../market-memory/market-company-key'
import type { OrionNeedRecord } from './orion-needs-csv'

/**
 * #5185 — rattacher un besoin SANS `account_id` à sa fiche `dataforge_accounts` par le NOM de l'entreprise.
 *
 * Correspondance EXACTE sur le nom normalisé (la normalisation et la liste de formes juridiques de
 * `crm-duplicates.normalizeAccountName`, aucune nouvelle) ; jamais approchée : on PROPOSE, on ne devine pas.
 * Rattaché seulement si UNE fiche (hors `est_doublon`) porte ce nom ; 0 ou plusieurs => pas de rattachement.
 */
export interface AccountNameFiche {
  sourceId: string
  name: string | null
  normalizedName: string | null
  legalName: string | null
  /** `entreprise`, `company_normalized_name`, `legal_name` du statut ORION. */
  statusNames: (string | null)[]
  estDoublon: boolean
}

export type AccountNameIndex = Map<string, Set<string>>

export type NeedAccountResolution =
  { kind: 'matched'; sourceId: string } | { kind: 'ambiguous' } | { kind: 'not_found' }

export function buildAccountNameIndex(fiches: readonly AccountNameFiche[]): AccountNameIndex {
  const index: AccountNameIndex = new Map()
  for (const fiche of fiches) {
    if (fiche.estDoublon) continue
    for (const raw of [fiche.name, fiche.normalizedName, fiche.legalName, ...fiche.statusNames]) {
      const key = normalizeAccountName(raw)
      if (key === '') continue
      const ids = index.get(key) ?? new Set<string>()
      ids.add(fiche.sourceId)
      index.set(key, ids)
    }
  }
  return index
}

export function resolveNeedAccount(entreprise: string | null, index: AccountNameIndex): NeedAccountResolution {
  const ids = index.get(normalizeAccountName(entreprise))
  if (ids === undefined || ids.size === 0) return { kind: 'not_found' }
  if (ids.size > 1) return { kind: 'ambiguous' }
  return { kind: 'matched', sourceId: [...ids][0] as string }
}

/**
 * Lot 794 (Louis 04/11/2026, « absolument tout rattaché ») — une clé de NOM du référentiel pivot `common_account_links`
 * (noms ET alias du pack v2.1, fiches DF), normalisée comme la table (`marketMatchKey`). Lue par le script seul.
 */
export interface CommonNameLink {
  keyValue: string
  commonId: string
  dataforgeSourceId: string | null
  groupAccountId: string | null
}

export type CommonNameIndex = Map<string, CommonNameLink[]>

export function buildCommonNameIndex(links: readonly CommonNameLink[]): CommonNameIndex {
  const index: CommonNameIndex = new Map()
  for (const link of links) {
    const list = index.get(link.keyValue) ?? []
    if (!list.some(known => known.commonId === link.commonId)) list.push(link)
    index.set(link.keyValue, list)
  }
  return index
}

type CommonNameResolution =
  | { kind: 'matched'; sourceId: string; commonId: string }
  | { kind: 'common_only'; commonId: string }
  | { kind: 'ambiguous' }
  | { kind: 'not_found' }

/**
 * La clé doit être NON AMBIGUË : une seule entreprise commune, ou plusieurs d'un MÊME groupe (la règle du résolveur,
 * `decideCommonCandidates`) — et, pour poser `account_source_id`, UNE seule fiche DF parmi elles. Jamais approché.
 */
function resolveNeedByCommonName(entreprise: string | null, index: CommonNameIndex): CommonNameResolution {
  const key = marketMatchKey(entreprise ?? '')
  const links = key === '' ? [] : (index.get(key) ?? [])
  if (links.length === 0) return { kind: 'not_found' }
  const groups = new Set(links.map(link => link.groupAccountId ?? ''))
  if (links.length > 1 && (groups.size > 1 || groups.has(''))) return { kind: 'ambiguous' }
  const fiches = [...new Set(links.map(link => link.dataforgeSourceId).filter((id): id is string => !!id))]
  if (fiches.length > 1) return { kind: 'ambiguous' }
  if (fiches.length === 1) {
    const holder = links.find(link => link.dataforgeSourceId === fiches[0])!
    return { kind: 'matched', sourceId: fiches[0] as string, commonId: holder.commonId }
  }
  return links.length === 1 ? { kind: 'common_only', commonId: links[0]!.commonId } : { kind: 'ambiguous' }
}

export interface NeedAccountMatchTally {
  byId: number
  byName: number
  /** Lot 794 — rattachés par une clé de nom du référentiel pivot (fiche DF univoque). */
  byCommonName: number
  /** Lot 794 — reconnus par le pivot mais sans fiche DF : l'identifiant commun est gardé, `account_source_id` reste vide. */
  commonOnly: number
  ambiguous: number
  notFound: number
  unmatchedNames: string[]
}

/**
 * Applique le rattachement à un besoin : l'identifiant, puis le nom exact unique, puis (lot 794) la clé de nom du
 * référentiel pivot. Une ligne qui porte déjà un `accountSourceId` n'est JAMAIS réécrite ;
 * un rattachement par nom garde son origine (`payload.account_match = "nom"`). Idempotent : le résultat ne dépend
 * que de la ligne et de l'index.
 */
export function attachNeedAccountByName<T extends OrionNeedRecord>(
  need: T,
  index: AccountNameIndex,
  tally: NeedAccountMatchTally,
  commonIndex?: CommonNameIndex,
): T {
  if (need.accountSourceId !== null) {
    tally.byId += 1
    return need
  }
  const resolution = resolveNeedAccount(need.entreprise, index)
  if (resolution.kind === 'matched') {
    tally.byName += 1
    return { ...need, accountSourceId: resolution.sourceId, payload: { ...need.payload, account_match: 'nom' } }
  }
  // Lot 794 — l'identifiant et le nom exact unique ont échoué : le référentiel pivot (nom ou alias normalisé).
  const pivot = commonIndex ? resolveNeedByCommonName(need.entreprise, commonIndex) : ({ kind: 'not_found' } as const)
  if (pivot.kind === 'matched') {
    tally.byCommonName += 1
    return {
      ...need,
      accountSourceId: pivot.sourceId,
      payload: { ...need.payload, account_match: 'referentiel_commun', common_account_id: pivot.commonId },
    }
  }
  if (pivot.kind === 'common_only') {
    tally.commonOnly += 1
    return {
      ...need,
      payload: { ...need.payload, account_match: 'referentiel_commun_sans_fiche', common_account_id: pivot.commonId },
    }
  }
  if (resolution.kind === 'ambiguous' || pivot.kind === 'ambiguous') tally.ambiguous += 1
  else tally.notFound += 1
  if (need.entreprise !== null && !tally.unmatchedNames.includes(need.entreprise))
    tally.unmatchedNames.push(need.entreprise)
  return need
}
