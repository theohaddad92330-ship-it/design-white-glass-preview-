// #1642 — DataTable : « tri, densité compacte, en-tête collant, zébrage
// subtil ». La DÉCISION de tri (cycle d'un clic, comparaison, position des
// valeurs non mesurées) vit ici, pure et testée exhaustivement — le rendu
// (sticky, zébrage) est pure CSS et se recette en direct.

// Local : rien hors de ce fichier ne nomme une direction — `SortState` la
// porte, et c'est lui que les appelants manipulent.
type SortDirection = 'asc' | 'desc'
export type SortState<K extends string> = { key: K; direction: SortDirection } | null

/**
 * Cycle au clic sur une colonne : aucun tri → asc → desc → aucun tri.
 * Cliquer une AUTRE colonne repart toujours à `asc` sur celle-ci.
 */
export function nextSortState<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (!current || current.key !== key) return { key, direction: 'asc' }
  if (current.direction === 'asc') return { key, direction: 'desc' }
  return null
}

export type SortableValue = string | number | null | undefined

/**
 * `null`/`undefined` — « non mesuré » — trie TOUJOURS en dernier, quel que
 * soit le sens du tri : sinon un tri descendant place une valeur absente en
 * TÊTE, ce qui la lit comme la plus grande valeur du tableau (doctrine :
 * non mesuré n'est jamais une valeur, encore moins la plus extrême).
 */
export function compareValues(a: SortableValue, b: SortableValue, direction: SortDirection): number {
  const aUnknown = a == null
  const bUnknown = b == null
  if (aUnknown && bUnknown) return 0
  if (aUnknown) return 1
  if (bUnknown) return -1

  const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'fr')
  return direction === 'asc' ? cmp : -cmp
}

export function sortRows<Row>(
  rows: readonly Row[],
  accessor: (row: Row) => SortableValue,
  direction: SortDirection,
): Row[] {
  return [...rows].sort((a, b) => compareValues(accessor(a), accessor(b), direction))
}

// ── #1672.6 — « les cinq états du tableau, distincts » ────────────────────
//
// chargement (squelette) · vide, jamais rien · vide À CAUSE du filtre (avec
// le geste pour l'effacer) · erreur · partiel. Un point d'entrée unique, la
// PRIORITÉ écrite une fois : `loading` et `error` court-circuitent tout le
// reste (il n'y a rien à filtrer pendant un chargement ou une panne), et une
// absence TOTALE prime sur « vide à cause du filtre » — sinon un tableau
// réellement vide inviterait à effacer une recherche qui n'existe pas.

export type TableStatus = 'loading' | 'ready' | 'error' | 'partial'

type TableState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'empty-filtered' }
  | { kind: 'rows'; partial: boolean }

export function resolveTableState(params: {
  status: TableStatus
  totalRows: number
  visibleRows: number
  hasActiveQuery: boolean
}): TableState {
  if (params.status === 'loading') return { kind: 'loading' }
  if (params.status === 'error') return { kind: 'error' }
  if (params.totalRows === 0) return { kind: 'empty' }
  if (params.hasActiveQuery && params.visibleRows === 0) return { kind: 'empty-filtered' }
  return { kind: 'rows', partial: params.status === 'partial' }
}

// ── #1672.4 — recherche en tête de tableau ─────────────────────────────────
//
// La décision de correspondance vit ici, pure : c'est elle qui garantit que
// le compteur affiché (« 12 sur 340 ») est TOUJOURS celui des lignes
// réellement rendues après filtrage — un compteur juste peut promettre un
// filtre faux si les deux chemins (affichage, comptage) divergent.

export function matchesQuery(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return haystack.toLowerCase().includes(q)
}

export function filterRowsByQuery<Row>(rows: readonly Row[], query: string, searchValue: (row: Row) => string): Row[] {
  if (!query.trim()) return [...rows]
  return rows.filter(row => matchesQuery(searchValue(row), query))
}

// ── #1672.1 — colonnes : visibilité et largeur, persistées par tableau ────
//
// `localStorage` peut jeter (navigation privée, site data bloqué) ou rendre
// une valeur écrite par une version antérieure du composant — ce qui suit ne
// FAIT jamais d'I/O : ça décide, défensivement, de ce qu'une chaîne lue vaut
// vraiment. L'I/O elle-même (avec son `try/catch`) vit dans `DataTable.tsx`,
// hors de portée d'un test qui tourne en environnement `node`.

export const MIN_COLUMN_WIDTH = 60
export const MAX_COLUMN_WIDTH = 640

export function clampColumnWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_COLUMN_WIDTH
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)))
}

/** Clé « par tableau » : deux tableaux du manager ne se marchent jamais dessus. */
export function columnVisibilityStorageKey(persistKey: string): string {
  return `bellum-dm:table:${persistKey}:hidden-columns`
}

export function columnWidthsStorageKey(persistKey: string): string {
  return `bellum-dm:table:${persistKey}:column-widths`
}

/**
 * Les clés inconnues (une colonne retirée depuis l'écriture) sont éliminées
 * plutôt que gardées : sinon une entrée orpheline s'accumule sans qu'aucun
 * écran ne permette plus de la voir ni de la lever.
 */
export function parseHiddenColumns(raw: string | null, knownKeys: readonly string[]): Set<string> {
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    const known = new Set(knownKeys)
    return new Set(parsed.filter((k): k is string => typeof k === 'string' && known.has(k)))
  } catch {
    return new Set()
  }
}

export function parseColumnWidths(raw: string | null, knownKeys: readonly string[]): Record<string, number> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const known = new Set(knownKeys)
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (known.has(key) && typeof value === 'number' && Number.isFinite(value)) {
        out[key] = clampColumnWidth(value)
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Ne jamais permettre de masquer la DERNIÈRE colonne visible — un tableau sans colonne n'affiche plus rien. */
export function canHideColumn(allKeys: readonly string[], hidden: ReadonlySet<string>, key: string): boolean {
  if (hidden.has(key)) return true // déjà masquée : (dé)masquer reste toujours permis
  const visibleCount = allKeys.filter(k => !hidden.has(k)).length
  return visibleCount > 1
}

// ── #1672.4 — pagination SERVEUR, opt-in ───────────────────────────────────
//
// `DataTable` ne pagine JAMAIS lui-même : il reçoit la page déjà chargée par
// l'appelant (`rows`), le total côté SERVEUR (au-delà de ce qui est chargé),
// et un simple geste pour en demander une autre — jamais de défilement
// infini, la page change sur un CLIC explicite. Ce qui suit ne fait aucune
// navigation : ça décide seulement « combien de pages », « y a-t-il un
// précédent/suivant » et « quelle plage de lignes affichée » — le geste lui-
// même (une URL, un state client) reste le choix de l'appelant.

export type PaginationInfo = {
  pageCount: number
  hasPrevious: boolean
  hasNext: boolean
  /** 1-indexé — première ligne affichée sur CETTE page. 0 si `total` est 0. */
  rangeStart: number
  /** 1-indexé, INCLUS — dernière ligne affichée. Sur la dernière page, elle
   *  s'arrête au TOTAL réel, jamais à un multiple plein de `pageSize`. */
  rangeEnd: number
}

export function resolvePagination(params: { page: number; pageSize: number; total: number }): PaginationInfo {
  const { page, pageSize, total } = params
  if (!Number.isFinite(pageSize) || pageSize <= 0 || total <= 0) {
    return { pageCount: 0, hasPrevious: false, hasNext: false, rangeStart: 0, rangeEnd: 0 }
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  // Une page hors bornes (avant le début, après la fin) se ramène à la plus
  // proche plutôt que de produire une plage qui ne correspond à rien.
  const safePage = Math.min(Math.max(1, page), pageCount)
  return {
    pageCount,
    hasPrevious: safePage > 1,
    hasNext: safePage < pageCount,
    rangeStart: (safePage - 1) * pageSize + 1,
    rangeEnd: Math.min(total, safePage * pageSize),
  }
}

// ── #1672.5 — virtualisation : fenêtre de lignes RENDUES ───────────────────
//
// Au-delà de `VIRTUALIZE_ROW_THRESHOLD` lignes affichées, monter chaque
// `<tr>` dans le DOM coûte cher (mise en page, mémoire) pour un gain nul : la
// fenêtre visible d'un conteneur borné (`maxHeight`) ne montre jamais plus
// d'une trentaine de lignes à la fois. La fenêtre est calculée ici, PURE, à
// partir d'une position de défilement et d'une hauteur de ligne FIXE
// (#1672.8, 32px) — une hauteur fixe est ce qui rend ce calcul possible sans
// mesurer le DOM ligne par ligne. `DataTable.tsx` mesure le défilement réel
// et rend deux lignes « vides » (haut/bas) à la place de ce qui n'est pas
// dans la fenêtre, pour que la hauteur totale — donc la barre de défilement —
// ne bouge jamais.

export const VIRTUALIZE_ROW_THRESHOLD = 200
export const ROW_HEIGHT_PX = 32

export type VirtualWindow = {
  startIndex: number
  /** Exclusif — `rows.slice(startIndex, endIndex)`. */
  endIndex: number
  topPaddingPx: number
  bottomPaddingPx: number
}

export function computeVirtualWindow(params: {
  rowCount: number
  rowHeightPx: number
  scrollTop: number
  viewportHeightPx: number
  overscan?: number
}): VirtualWindow {
  const { rowCount, rowHeightPx, scrollTop, viewportHeightPx, overscan = 8 } = params
  // Hauteur de ligne invalide, aucune ligne, ou pas ENCORE mesuré (avant le
  // premier layout) : tout rendre plutôt que tout cacher derrière un calcul
  // qui n'a rien à mesurer.
  if (rowCount === 0 || !Number.isFinite(rowHeightPx) || rowHeightPx <= 0 || viewportHeightPx <= 0) {
    return { startIndex: 0, endIndex: rowCount, topPaddingPx: 0, bottomPaddingPx: 0 }
  }
  const visibleCount = Math.ceil(viewportHeightPx / rowHeightPx)
  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeightPx)
  const startIndex = Math.max(0, firstVisible - overscan)
  const endIndex = Math.min(rowCount, firstVisible + visibleCount + overscan)
  return {
    startIndex,
    endIndex,
    topPaddingPx: startIndex * rowHeightPx,
    bottomPaddingPx: Math.max(0, (rowCount - endIndex) * rowHeightPx),
  }
}

// ── #1672.6 — export CSV : TENTÉ, puis RETIRÉ ──────────────────────────────
//
// `csvEscape`/`buildCsv` (RFC 4180) et le bouton « Export CSV » de
// `DataTable.tsx` ont été écrits, testés, puis retirés entièrement : voir le
// docblock de `DataTable.tsx` juste avant `export function DataTable` pour
// la raison (une garde d'architecture hors du périmètre en écriture de ce
// lot interdit tout mécanisme de fichier téléchargeable dans le manager, et
// la valeur de cellule envisagée aurait exporté des adresses non masquées).
// Rien de ce fichier n'en garde de trace — du code juste que personne
// n'appelle est exactement ce que ce dépôt refuse de laisser traîner.
