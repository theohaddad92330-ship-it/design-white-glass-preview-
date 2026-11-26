import { hasHiringRoles, hiringScopeVerdict, nafPrefixesForSectors } from '@bellum/contracts'
import type { SalesProfileForRelevance } from '@bellum/contracts'
import type { DiscoverSignal } from './discover-types'

/**
 * LUDOVIC-C LC.3 — la Liste d'appels suit le PACK du profil, avec le classement de l'onglet
 * Comptes (pas un second moteur).
 *
 * Recette prod 19/10 (Stelya, pack industriel, zone AURA) : Enedis, France Travail, La Poste,
 * Orange, SNCF, Ville de Paris, Carrefour, triées par TAILLE, quand l'onglet Comptes sortait
 * STILL, Dalkia, KSB, Framatome. Pour un pack industriel :
 *  - administrations / secteur public et distribution sont ÉCARTÉS (et comptés, jamais tus),
 *    sauf si le profil les cible (`public_sector`, `retail`) ;
 *  - l'ordre = un signal daté dans SES métiers d'abord (`hiringScopeVerdict`, le verdict de
 *    « Comptes qui recrutent »), puis le secteur ciblé, puis l'ordre reçu (taille).
 * Hors pack industriel : liste rendue telle quelle (byte-identique).
 * Les correspondances NAF viennent de `nafPrefixesForSectors` (contracts, une seule table, GA-26).
 */
type PackCandidate = { name?: string; nafCode: string | null; signals: readonly DiscoverSignal[] }

/**
 * LUDOVIC-E LC.3b — le NAF seul ne tenait pas (recette prod 20/10) : Carrefour Proximité, « Député
 * employeur de collaborateurs » et La Poste restaient. Le NOM complète le NAF, par secteur écarté ;
 * le NAF postal (53.10) et les organisations politiques (94.92) y sont rattachés au secteur public.
 */
const NAME_PATTERNS: Record<(typeof OUT_OF_PACK_SECTORS)[number], RegExp> = {
  public_sector:
    /\b(depute|senateur|assemblee nationale|senat|mairie|commune de|ville de|conseil (?:regional|departemental|municipal)|departement d[eu]|prefecture|ministere|la poste|france travail|pole emploi|caisse d'allocations|cpam|urssaf|centre hospitalier|universite)\b/,
  retail:
    /\b(carrefour|leclerc|auchan|intermarche|lidl|casino|monoprix|franprix|super u|systeme u|cora|aldi|picard|biocoop|supermarche|hypermarche)\b/,
}
const EXTRA_NAF_PREFIXES: Record<(typeof OUT_OF_PACK_SECTORS)[number], readonly string[]> = {
  public_sector: ['5310', '9492'],
  retail: [],
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const OUT_OF_PACK_SECTORS = ['public_sector', 'retail'] as const

function matches(naf: string | null, prefixes: readonly string[]): boolean {
  // Même forme que `nafPrefixesForSectors` : quatre chiffres, sans point (« 84.13Z » → « 8413 »).
  const code = (naf ?? '').replace(/\D/g, '').slice(0, 4)
  return code.length === 4 && prefixes.includes(code)
}

export function orderCallListByPack<T extends PackCandidate>(
  candidates: readonly T[],
  options: {
    industrial: boolean
    targetSectors: readonly string[]
    relevanceProfile: SalesProfileForRelevance | undefined
  },
): { kept: T[]; outOfPack: number } {
  if (!options.industrial) return { kept: [...candidates], outOfPack: 0 }
  const outOfPackSectors = OUT_OF_PACK_SECTORS.filter(sector => !options.targetSectors.includes(sector))
  const outOfPackPrefixes = [
    ...nafPrefixesForSectors(outOfPackSectors),
    ...outOfPackSectors.flatMap(sector => EXTRA_NAF_PREFIXES[sector]),
  ]
  const isOutOfPack = (candidate: T) =>
    matches(candidate.nafCode, outOfPackPrefixes) ||
    outOfPackSectors.some(sector => NAME_PATTERNS[sector].test(fold(candidate.name ?? '')))
  const kept = candidates.filter(candidate => !isOutOfPack(candidate))
  const targetPrefixes = nafPrefixesForSectors(options.targetSectors)
  // LC.3b — « dans SES métiers » se lit sur le verdict de Découvrir (métiers déclarés, à défaut déduits) :
  // un signal HORS métiers ne fait pas passer devant. `recruitsForClients` (#1124.1) garde la main : pas de rang.
  const profile = options.relevanceProfile
  const ranksByTrade = hasHiringRoles(profile) && profile?.recruitsForClients !== true
  const inTrade = (candidate: T) =>
    ranksByTrade &&
    candidate.signals.some(signal => signal.type === 'hiring' && hiringScopeVerdict(signal.label, profile).keep)
  // Tri STABLE : métier d'abord, puis secteur ciblé, puis l'ordre reçu (taille).
  const ordered = [...kept].sort(
    (a, b) =>
      Number(!inTrade(a)) - Number(!inTrade(b)) ||
      Number(!matches(a.nafCode, targetPrefixes)) - Number(!matches(b.nafCode, targetPrefixes)),
  )
  return { kept: ordered, outOfPack: candidates.length - kept.length }
}
