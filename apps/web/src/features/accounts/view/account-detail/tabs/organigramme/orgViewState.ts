import { DEFAULT_ORG_VIEW_MODE, ORG_VIEW_MODES, type OrgViewMode } from './orgViewModes'

/**
 * #4061.b — L'ÉTAT DE L'ORGANIGRAMME VOYAGE DANS L'URL.
 *
 * Recette 13/10 : « le retour conserve branche, filtres et sélection ». Ouvrir une fiche démonte
 * l'onglet ; un état local (vue, direction, filtres, colonnes repliées, nœud choisi) repartait du
 * défaut. Dans les search params de `/accounts/$id`, le retour du navigateur ET le fil d'Ariane de la
 * fiche (`fromOrg`, contactOrigin.ts) le retrouvent. Un défaut n'écrit AUCUNE clé : un lien nu reste nu.
 */
type OrgInfluenceFilters = {
  entity: string
  family: string
  level: string
  role: string
  project: string
  minConfidence: string
  name: string
  display: 'map' | 'list'
}

export type OrgViewState = {
  mode: OrgViewMode
  /** `null` = la direction par défaut, décidée par `defaultFocalDirectionId`. */
  directionId: string | null
  /** Les colonnes repliées de la carte d'influence (id d'entité, `unassigned`). */
  collapsed: readonly string[]
  filters: OrgInfluenceFilters
  /** Le nœud choisi (id de personne du graphe, ou id de contact pour un nœud ouvert vers sa fiche). */
  selectedId: string | null
}

/** Les clés d'URL — des search params de `/accounts/$id`, voir `accountDetailSearch.ts`. */
type OrgSearchKeys = { ov?: string; od?: string; oc?: string; of?: string; os?: string }

const NO_FILTERS: OrgInfluenceFilters = {
  entity: '',
  family: '',
  level: '',
  role: '',
  project: '',
  minConfidence: '',
  name: '',
  display: 'map',
}

export const DEFAULT_ORG_VIEW_STATE: OrgViewState = {
  mode: DEFAULT_ORG_VIEW_MODE,
  directionId: null,
  collapsed: [],
  filters: NO_FILTERS,
  selectedId: null,
}

const FILTER_KEYS = ['entity', 'family', 'level', 'role', 'project', 'minConfidence', 'name'] as const

function readFilters(raw: string | undefined): OrgInfluenceFilters {
  if (!raw) return NO_FILTERS
  try {
    const params = new URLSearchParams(raw)
    const next: OrgInfluenceFilters = { ...NO_FILTERS }
    for (const key of FILTER_KEYS) next[key] = params.get(key) ?? ''
    next.display = params.get('display') === 'list' ? 'list' : 'map'
    return next
  } catch {
    return NO_FILTERS
  }
}

function writeFilters(filters: OrgInfluenceFilters): string | undefined {
  const params = new URLSearchParams()
  for (const key of FILTER_KEYS) if (filters[key]) params.set(key, filters[key])
  if (filters.display === 'list') params.set('display', 'list')
  const text = params.toString()
  return text || undefined
}

export function orgStateFromSearch(search: OrgSearchKeys): OrgViewState {
  const mode = (ORG_VIEW_MODES as readonly string[]).includes(search.ov ?? '')
    ? (search.ov as OrgViewMode)
    : DEFAULT_ORG_VIEW_MODE
  return {
    mode,
    directionId: search.od || null,
    collapsed: search.oc ? search.oc.split(',').filter(Boolean) : [],
    filters: readFilters(search.of),
    selectedId: search.os || null,
  }
}

export function orgStateToSearch(state: OrgViewState): Required<Record<keyof OrgSearchKeys, string | undefined>> {
  return {
    ov: state.mode === DEFAULT_ORG_VIEW_MODE ? undefined : state.mode,
    od: state.directionId ?? undefined,
    oc: state.collapsed.length > 0 ? state.collapsed.join(',') : undefined,
    of: writeFilters(state.filters),
    os: state.selectedId ?? undefined,
  }
}

/** Les seules clés POSÉES (les défauts retirés) — ce que le fil d'Ariane d'une fiche rapporte au retour. */
export function definedOrgKeys(state: OrgViewState): OrgSearchKeys {
  return Object.fromEntries(Object.entries(orgStateToSearch(state)).filter(([, value]) => value !== undefined))
}
