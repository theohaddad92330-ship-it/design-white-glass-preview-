import { ANALYSIS_OBJECTIVES } from './analysis.js'
import type {
  AnalysisGeoPerimeter,
  AnalysisHierarchyLevel,
  AnalysisObjective,
  AnalysisScopeMode,
  AnalysisScopeSelection,
} from './analysis.js'
import { normalizeScopeLabel } from './geo-perimeter.js'

/**
 * CADRAGE D'ANALYSE (retour Louis 15/10/2026, /search — « on mélange et répète
 * plusieurs choses »). Le parcours avait une rangée « Périmètre » à l'écran 1
 * (France · Groupe entier · Filiales · IT & Digital · Startups · BU…) PUIS un
 * écran 2 qui redemandait la géographie, les familles métier et un effectif
 * absurde pour UNE entreprise. Désormais l'écran 1 = entreprise + objectif, et
 * l'écran 2 pose QUATRE questions, une fois chacune :
 *
 *   1. Où ?                         → `geo_perimeter` (+ `geo_areas`), défaut France
 *   2. Quelle partie du groupe ?    → `included_entities` / `excluded_entities`
 *   3. Quoi ?                       → `selected_angles` (ce que tu vends) +
 *                                     `business_families` (postes à placer) +
 *                                     `excluded_angles` (thèmes à exclure)
 *   4. Qui ?                        → `hierarchy_levels`
 *
 * Le contrat `AnalysisScopeSelection` ne change PAS de forme : les runs déjà
 * faits restent lisibles tels quels. Ce module porte les trois traductions qui
 * manquaient : l'ancien périmètre → les nouveaux champs (liens existants), la
 * géographie → le mode encore lu par l'IA, et le récap « Cadrage appliqué ».
 */

/** Le défaut lisible de la question « Où ? » (posé par l'écran quand le marché est la France). */
export const DEFAULT_CADRAGE_GEO: AnalysisGeoPerimeter = 'france'

/**
 * Un ancien `scope=…` (URL, brouillon, mémoire #4161) → les champs du cadrage.
 *
 * Seule la GÉOGRAPHIE des anciens modes avait un effet mesurable côté IA
 * (`_scope_forces_france_only`, `phase1_research.py`) : `france` et `site`
 * forçaient un filtre géo, tous les autres n'en posaient aucun. La migration
 * garde exactement ça — « Groupe entier », « Filiales », « Startups »… ne
 * filtraient aucun pays, ils deviennent `world` plutôt que le défaut France,
 * sinon un lien existant analyserait soudain moins qu'avant.
 */
export function cadrageFromLegacyScopeMode(mode: string | null | undefined): Partial<AnalysisScopeSelection> {
  switch (mode) {
    case 'france':
      return { geo_perimeter: 'france' }
    case 'site':
      return { geo_perimeter: 'city' }
    case 'groupe':
    case 'filiales':
    case 'it_digital':
    case 'startups':
    case 'business_unit':
    case 'direction':
    case 'programme':
    case 'custom':
      return { geo_perimeter: 'world' }
    default:
      return {}
  }
}

/**
 * Le `scopeMode` envoyé au serveur, DÉDUIT de la question « Où ? » — il n'a
 * plus de sélecteur à lui. L'IA le lit encore pour sa consigne de périmètre et
 * son filtre géo dur (`_scope_directive`, `_scope_forces_france_only`) : une
 * région est française, une ville est un site, le reste ne restreint aucun pays.
 */
export function scopeModeForCadrage(selection: AnalysisScopeSelection | null | undefined): AnalysisScopeMode {
  // Sans zone posée (marché hors France, où aucun défaut restrictif n'est câblé — #3742),
  // aucun pays n'est forcé : c'est l'écran qui pose France par défaut, pas cette traduction.
  const geo = selection?.geo_perimeter
  if (geo === 'france' || geo === 'region') return 'france'
  if (geo === 'city') return 'site'
  return 'groupe'
}

/**
 * Postes à placer (`business_families`) — LE champ qui trie les recrutements et
 * les contacts. Stocké en LIBELLÉ (FR ou EN, selon la langue de l'écran) depuis
 * #2163.14 : les deux libellés d'une famille rendent les mêmes termes. Les
 * termes sont ceux d'un intitulé de poste réel, jamais une catégorie : c'est ce
 * que `rank_offers_by_placed_roles` / `profile_job_scope` (apps/ia) comparent
 * mot à mot aux offres — le même contrat que les « postes visés » du profil
 * (`placedRoles`, lot JOBS-CIBLE #4182).
 */
export const BUSINESS_FAMILY_IDS = [
  'cyber',
  'data_ia',
  'cloud',
  'agility',
  'finance',
  'hr',
  'procurement',
  'industry',
  'supply',
  'product',
  'other',
] as const
type BusinessFamilyId = (typeof BUSINESS_FAMILY_IDS)[number]

const BUSINESS_FAMILIES: Record<BusinessFamilyId, { labels: readonly string[]; terms: readonly string[] }> = {
  cyber: {
    labels: ['Cyber'],
    terms: ['cyber', 'cybersecurite', 'securite', 'security', 'soc', 'pentest', 'pentester', 'rssi', 'ciso', 'iam'],
  },
  data_ia: {
    labels: ['Data / IA', 'Data / AI'],
    terms: ['data', 'donnees', 'ia', 'ai', 'machine learning', 'bi', 'analytics', 'mlops'],
  },
  cloud: {
    labels: ['Cloud'],
    terms: ['cloud', 'devops', 'sre', 'aws', 'azure', 'gcp', 'kubernetes', 'infrastructure'],
  },
  agility: { labels: ['Agilité', 'Agile'], terms: ['agile', 'agilite', 'scrum', 'product owner', 'coach agile'] },
  finance: { labels: ['Finance'], terms: ['finance', 'financier', 'controle de gestion', 'comptable', 'tresorerie'] },
  hr: { labels: ['RH', 'HR'], terms: ['rh', 'hr', 'ressources humaines', 'paie', 'sirh'] },
  procurement: { labels: ['Achats', 'Purchasing'], terms: ['achats', 'acheteur', 'purchasing', 'procurement'] },
  industry: {
    labels: ['Industrie', 'Industry'],
    terms: ['industrie', 'industriel', 'production', 'automatisme', 'ot'],
  },
  supply: { labels: ['Supply'], terms: ['supply', 'logistique', 'supply chain', 'approvisionnement'] },
  product: { labels: ['Produit', 'Product'], terms: ['produit', 'product', 'product manager', 'chef de produit'] },
  // « Autre » ne dit aucun métier : il ne filtre ni ne trie rien.
  other: { labels: ['Autre', 'Other'], terms: [] },
}

const FAMILY_BY_LABEL = new Map<string, BusinessFamilyId>(
  (Object.entries(BUSINESS_FAMILIES) as [BusinessFamilyId, { labels: readonly string[] }][]).flatMap(
    ([id, { labels }]) => labels.map(label => [normalizeScopeLabel(label), id] as const),
  ),
)

/** Les termes (normalisés, dédupliqués) des postes à placer choisis. */
export function businessFamilyTerms(labels: readonly string[] | null | undefined): string[] {
  const out: string[] = []
  for (const label of labels ?? []) {
    const key = normalizeScopeLabel(label)
    if (!key) continue
    const id = FAMILY_BY_LABEL.get(key)
    const terms = id ? BUSINESS_FAMILIES[id].terms : [key]
    for (const term of terms) if (!out.includes(term)) out.push(term)
  }
  return out
}

/** Une ligne du récap « Cadrage appliqué » — ce qui a filtré quoi. */
export type CadrageAppliedPart =
  | { key: 'objectives'; objectives: AnalysisObjective[] }
  | { key: 'angle'; value: string }
  | { key: 'geo'; geo: AnalysisGeoPerimeter; values: string[] }
  | { key: 'included' | 'excluded' | 'priorities' | 'roles' | 'excludedThemes' | 'contactEntities'; values: string[] }
  | { key: 'levels'; levels: AnalysisHierarchyLevel[] }

/**
 * Le récap affiché en tête du dossier livré. Ne nomme QUE ce qui a été posé
 * (« on n'affiche pas ce qu'on n'a pas ») et seulement les paramètres qui
 * agissent : la profondeur a sa propre ligne d'historique, l'effectif est
 * supprimé de l'écran (il n'avait aucun effet sur l'analyse d'UNE entreprise).
 * Un run d'avant ce lot, sans cadrage, ne fabrique aucune ligne.
 */
export function cadrageApplied(
  selection: Partial<AnalysisScopeSelection> | Record<string, unknown> | null | undefined,
): CadrageAppliedPart[] {
  if (!selection) return []
  const s = selection as Partial<AnalysisScopeSelection>
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : []
  const parts: CadrageAppliedPart[] = []
  // Théo B r1-recherche.N6 — les objectifs (table fermée du contrat) puis l'angle, avant ce qu'ils ont filtré.
  const objectives = list(s.objectives).filter((v): v is AnalysisObjective => ANALYSIS_OBJECTIVES.some(o => o === v))
  if (objectives.length > 0) parts.push({ key: 'objectives', objectives })
  if (typeof s.angle === 'string' && s.angle.trim().length > 0) parts.push({ key: 'angle', value: s.angle.trim() })
  if (typeof s.geo_perimeter === 'string') parts.push({ key: 'geo', geo: s.geo_perimeter, values: list(s.geo_areas) })
  const lists = [
    ['included', s.included_entities],
    ['excluded', s.excluded_entities],
    ['priorities', s.selected_angles],
    ['roles', s.business_families],
    ['excludedThemes', s.excluded_angles],
  ] as const
  for (const [key, value] of lists) {
    const values = list(value)
    if (values.length > 0) parts.push({ key, values })
  }
  const levels = list(s.hierarchy_levels) as AnalysisHierarchyLevel[]
  if (levels.length > 0) parts.push({ key: 'levels', levels })
  // Lot 757 — les filiales COCHÉES au sélecteur de périmètre : un coéquipier lit où les contacts ont été cherchés.
  const checked = Array.isArray(s.contact_entities)
    ? s.contact_entities.flatMap(e => (e && typeof e.name === 'string' && e.name.trim() ? [e.name.trim()] : []))
    : []
  if (checked.length > 0) parts.push({ key: 'contactEntities', values: checked })
  return parts
}
