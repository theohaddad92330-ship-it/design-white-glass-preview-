import type { DiscoverCandidate } from './discover-types'
import { applyRailConstraints, countActiveFilters, emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'

/**
 * #4997 — quand la liste est vide (ou presque) et que plusieurs filtres sont posés, l'écran DIT lequel la vide :
 * « sans le filtre Taille : N comptes ». Calcul PUR sur les candidats déjà reçus (`applyRailConstraints`, le même
 * croisement que la liste) : aucun appel en plus. Un filtre que la source applique côté serveur (région, CA…) ne se
 * mesure pas ici — il n'est jamais deviné, donc jamais nommé.
 */
type BlockingKey =
  | 'sectors'
  | 'headcount'
  | 'age'
  | 'department'
  | 'city'
  | 'cdiOnly'
  | 'freelanceOnly'
  | 'cddOnly'
  | 'interimOnly'
  | 'remotePolicies'
  | 'seniorities'
  | 'decisionLevels'
  | 'deliveryFitFilter'
  | 'groupRole'
  | 'workedOnly'
  | 'contractRecourseObserved'
  | 'excludeSectors'
  | 'excludePublicEmployers'
  | 'entityType'

interface BlockingFilter {
  key: BlockingKey
  /** Nombre de comptes qui reviendraient sans CE filtre (tous les autres restent posés). */
  count: number
}

const RESETS: Record<BlockingKey, readonly (keyof UnifiedFilters)[]> = {
  sectors: ['sectors', 'nafCode'],
  headcount: ['headcount'],
  age: ['age'],
  department: ['department'],
  city: ['city'],
  cdiOnly: ['cdiOnly'],
  freelanceOnly: ['freelanceOnly'],
  cddOnly: ['cddOnly'],
  interimOnly: ['interimOnly'],
  remotePolicies: ['remotePolicies'],
  seniorities: ['seniorities'],
  decisionLevels: ['decisionLevels'],
  deliveryFitFilter: ['deliveryFitFilter'],
  groupRole: ['groupRole'],
  workedOnly: ['workedOnly'],
  contractRecourseObserved: ['contractRecourseObserved'],
  excludeSectors: ['excludeSectors'],
  excludePublicEmployers: ['excludePublicEmployers'],
  entityType: ['entityType'],
}

/**
 * #4999 — « Freelance seul » posé alors qu'AUCUNE offre reçue ne porte le champ contrat de sa source : l'écran le DIT
 * (le filtre ne peut rien garder), au lieu d'une liste vide muette. Jamais déduit du texte libre.
 */
export function freelanceSignalMissing(candidates: readonly DiscoverCandidate[], filters: UnifiedFilters): boolean {
  if (!filters.freelanceOnly) return false
  const hiring = candidates.flatMap(c => c.signals.filter(s => s.type === 'hiring'))
  return hiring.length > 0 && hiring.every(s => !s.contractType)
}

/** Sous ce nombre de lignes, la liste est « presque vide » et le filtre qui l'étouffe se nomme. */
const SHORT_LIST = 3

/**
 * Les filtres dont la levée rend des comptes, du plus rendant au moins rendant. `[]` quand moins de deux filtres sont
 * posés (un seul filtre ne « se combine » pas : #3878.1) ou quand la liste n'est pas courte.
 */
type KnownLevels = Parameters<typeof applyRailConstraints>[4]

export function blockingFilters(
  candidates: readonly DiscoverCandidate[],
  filters: UnifiedFilters,
  mode: 'registry' | 'signals',
  listedCount: number,
  nowMs: number = Date.now(),
  known?: KnownLevels,
): BlockingFilter[] {
  if (listedCount >= SHORT_LIST || countActiveFilters(filters) < 2) return []
  const defaults = emptyUnifiedFilters()
  const out: BlockingFilter[] = []
  for (const key of Object.keys(RESETS) as BlockingKey[]) {
    const fields = RESETS[key]
    // Seul un filtre RÉELLEMENT posé peut être le coupable.
    if (fields.every(field => JSON.stringify(filters[field]) === JSON.stringify(defaults[field]))) continue
    const lifted = { ...filters } as Record<string, unknown>
    for (const field of fields) lifted[field] = defaults[field]
    const count = applyRailConstraints(candidates, lifted as unknown as UnifiedFilters, mode, nowMs, known).length
    if (count > listedCount) out.push({ key, count })
  }
  return out.sort((a, b) => b.count - a.count)
}
