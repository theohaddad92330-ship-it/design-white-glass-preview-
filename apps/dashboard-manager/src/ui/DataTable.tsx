'use client'

import type { KeyboardEvent, PointerEvent, ReactNode, UIEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  canHideColumn,
  clampColumnWidth,
  columnVisibilityStorageKey,
  columnWidthsStorageKey,
  compareValues,
  computeVirtualWindow,
  filterRowsByQuery,
  nextSortState,
  parseColumnWidths,
  parseHiddenColumns,
  resolvePagination,
  resolveTableState,
  ROW_HEIGHT_PX,
  VIRTUALIZE_ROW_THRESHOLD,
} from './DataTable.logic'
import type { PaginationInfo, SortState, SortableValue, TableStatus, VirtualWindow } from './DataTable.logic'
import { EmptyState } from './EmptyState'
import { Skeleton } from './Skeleton'
import styles from './DataTable.module.css'

export type DataTableColumn<Row> = {
  key: string
  header: string
  align?: 'left' | 'right'
  /** Omis = colonne non triable. */
  sortValue?: (row: Row) => SortableValue
  render: (row: Row) => ReactNode
}

/** Pas de rebond, pas de fondu : un pas fixe, comme le tri l'est déjà. */
const RESIZE_STEP_PX = 16
const DEFAULT_COLUMN_WIDTH_PX = 140

/**
 * #1642 — DataTable : tri, densité compacte, en-tête collant, zébrage
 * subtil. La décision de tri elle-même (cycle, comparaison, position des
 * valeurs non mesurées) vit dans `DataTable.logic.ts`, testée en isolation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1672.6 — CINQ ÉTATS DISTINCTS, et #1672.4/#1672.1 comme capacités OPT-IN
 * ─────────────────────────────────────────────────────────────────────────
 * `status`, `searchValue` et `persistKey` sont TOUS optionnels : un appelant
 * qui ne les passe pas obtient EXACTEMENT le rendu d'avant ce lot (aucun
 * wrapper neuf dans le DOM — le retour au chemin d'origine passe par un
 * Fragment, pas par un `<div>` supplémentaire). C'est ce qui garde les 6
 * appelants existants inchangés.
 *
 *  · `status='loading'`  → squelette (`Skeleton`, ici son premier appelant
 *    réel — #1642 le notait « aucun appelant, et c'est délibéré » ; ça cesse
 *    de l'être ici).
 *  · `status='error'`    → `EmptyState` + `onRetry` optionnel.
 *  · `rows.length === 0` → `EmptyState` avec `emptyMessage` — « vide, jamais
 *    rien », distinct de ce qui suit.
 *  · une recherche active qui ne retient AUCUNE ligne → « Aucun résultat pour
 *    « … » », avec le GESTE pour l'effacer (bouton, ET le champ reste éditable
 *    au-dessus) — c'est le point qui n'existait nulle part dans l'app avant
 *    ce lot.
 *  · `status='partial'`  → une bannière au-dessus du tableau, qui reste
 *    affiché : « partiel » ne remplace pas les lignes, il les qualifie.
 *
 * La priorité entre ces états est écrite UNE fois, dans `resolveTableState`
 * (`DataTable.logic.ts`), testée exhaustivement — ce fichier ne fait que la
 * RENDRE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1672.4 — LE COMPTEUR EST CE QUI EST RÉELLEMENT RENDU, jamais un total qui ment
 * ─────────────────────────────────────────────────────────────────────────
 * « 12 sur 340 » lit `sorted.length` (les lignes qui finissent dans `<tbody>`)
 * sur `rows.length` (le total reçu) — jamais deux chemins de calcul séparés
 * qui pourraient diverger.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1672.1 — SÉLECTEUR DE COLONNES + LARGEUR REDIMENSIONNABLE, PERSISTÉS
 * ─────────────────────────────────────────────────────────────────────────
 * `persistKey` est la clé PAR TABLEAU (`bellum-dm:table:<persistKey>:…`) —
 * deux tableaux ne se marchent jamais dessus. `localStorage` peut jeter
 * (navigation privée, site data bloqué) : CHAQUE lecture et CHAQUE écriture
 * sont dans leur propre `try/catch`, et le tableau se rend correctement sans
 * valeur mémorisée (comportement par défaut : toutes les colonnes visibles,
 * largeur automatique). La lecture initiale se fait dans un `useEffect` — au
 * premier rendu (serveur ET client, avant hydratation) `localStorage` n'existe
 * pas encore côté serveur, donc lire pendant le rendu romprait l'hydratation.
 *
 * ⚠️ `columns[].render`/`sortValue` sont des FONCTIONS : un Server Component
 * ne peut pas les fournir directement (une fonction ne traverse pas la
 * frontière RSC serveur → client). L'écran appelant doit être — ou contenir
 * — un Client Component ; naturel pour un back-office interactif, mais à
 * savoir avant de câbler un premier écran dessus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1672.4 — PAGINATION SERVEUR, opt-in, jamais de défilement infini
 * ─────────────────────────────────────────────────────────────────────────
 * `page`/`pageSize`/`total`/`onPageChange` sont TOUS requis ensemble pour que
 * le pied de page apparaisse — un appelant qui n'en passe aucun garde le
 * rendu d'avant ce lot. `rows` reste la page COURANTE déjà chargée par
 * l'appelant (`DataTable` ne charge, ne met en cache et ne devine RIEN) ;
 * `total` est le compte réel côté serveur, au-delà de ce qui est chargé.
 * `onPageChange` est un simple geste — comment il se traduit (une URL, un
 * state) reste le choix de l'appelant. La dérivation (nombre de pages,
 * précédent/suivant, plage affichée) vit UNE fois dans `resolvePagination`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1672.5 — VIRTUALISATION, automatique, jamais un choix de l'appelant
 * ─────────────────────────────────────────────────────────────────────────
 * Au-delà de `VIRTUALIZE_ROW_THRESHOLD` (200) lignes RENDUES, seule une
 * fenêtre de `<tr>` est montée dans le DOM — le reste est remplacé par deux
 * lignes « vides » dont la hauteur comble exactement ce qui manque, pour que
 * la barre de défilement ne bouge jamais. Elle ne s'active QUE si `maxHeight`
 * est posé : sans un conteneur borné, il n'y a pas de scroll interne à
 * mesurer, donc rien à virtualiser (le calcul se dégraderait en « tout
 * rendre », donc rien ne casse, mais rien n'accélère non plus). Aucune prop :
 * un appelant qui dépasse le seuil en bénéficie sans rien changer chez lui.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1672.6 — EXPORT CSV : TENTÉ, puis RETIRÉ — voir pourquoi
 * ─────────────────────────────────────────────────────────────────────────
 * Une implémentation complète (bouton, `Blob`, `URL.createObjectURL`) a été
 * écrite puis retirée : `src/architecture/aucun-export-de-donnees-
 * personnelles.test.ts` (#1670.5) interdit TOUT mécanisme de fichier à
 * quitter la console, sans exception nommée — et ce fichier de garde est
 * hors du périmètre en écriture de ce lot. Pire : la valeur de cellule
 * envisagée (`sortValue`) porte l'adresse BRUTE, non masquée, sur les
 * colonnes email (ex. `users-table.tsx` : `sortValue: row => row.email`,
 * nécessaire pour trier alors que `<MaskedEmail>` masque l'AFFICHAGE) — un
 * export généré à partir de `sortValue` aurait donc emporté exactement ce
 * que la garde existe pour empêcher. Debloquer #1672.6 demande une décision
 * produit (une exception nommée dans la garde, avec sa raison) avant toute
 * réécriture ; voir le rapport de ce lot.
 */
type PagerLabels = {
  previous: string
  next: string
  range: (start: number, end: number, total: number) => string
}

/**
 * #1672.4 — le défaut du pagineur, en français, comme le reste du chrome de ce
 * composant (« Colonnes », « Réessayer », « Rechercher… »). Les cinq appelants
 * qui ne paginent pas ne changent pas d'un octet.
 */
const PAGER_LABELS_FR: PagerLabels = {
  previous: '← Précédent',
  next: 'Suivant →',
  range: (start, end, total) => `${start}–${end} sur ${total}`,
}

export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  maxHeight,
  status = 'ready',
  errorMessage,
  onRetry,
  partialMessage,
  loadingRowCount = 6,
  emptyMessage = 'Aucune ligne.',
  searchValue,
  searchPlaceholder = 'Rechercher…',
  persistKey,
  page,
  pageSize,
  total,
  onPageChange,
  pagerLabels = PAGER_LABELS_FR,
}: {
  rows: readonly Row[]
  columns: ReadonlyArray<DataTableColumn<Row>>
  rowKey: (row: Row) => string
  /** Borne la hauteur du conteneur (l'en-tête reste collant en défilant). */
  maxHeight?: number | string
  /** #1672.6 — cinq états distincts. Par défaut `'ready'` : chemin inchangé. */
  status?: TableStatus
  /** Affiché quand `status === 'error'`. */
  errorMessage?: string
  /** Si fourni, `status === 'error'` propose un bouton « Réessayer ». */
  onRetry?: () => void
  /** Affiché en bannière quand `status === 'partial'`. */
  partialMessage?: string
  /** Nombre de lignes squelette pendant `status === 'loading'`. */
  loadingRowCount?: number
  /** Message affiché quand `rows` est réellement vide (pas un effet du filtre). */
  emptyMessage?: string
  /** #1672.4 — fourni = active la recherche en tête de tableau + le compteur. */
  searchValue?: (row: Row) => string
  searchPlaceholder?: string
  /** #1672.1 — fourni = active le sélecteur de colonnes + le redimensionnement,
   *  persistés sous cette clé (unique par tableau). */
  persistKey?: string
  /** #1672.4 — page COURANTE (1-indexée) d'une pagination serveur. Les quatre
   *  props de pagination sont requises ENSEMBLE pour afficher le pied de page. */
  page?: number
  /** #1672.4 — nombre de lignes par page côté serveur. */
  pageSize?: number
  /** #1672.4 — compte total côté serveur (au-delà de `rows`, la page chargée). */
  total?: number
  /** #1672.4 — demande la page N. Jamais de défilement infini : un geste explicite. */
  onPageChange?: (page: number) => void
  /**
   * #1672.4 — les libellés du pagineur.
   *
   * `/queues` est le SEUL écran BILINGUE qui utilise ce composant, et son
   * ancien pagineur maison n'avait aucun mot à traduire (« ← 1–50 »). Le
   * porter ici rendait donc du français en dur sur un rendu anglais — une
   * régression qu'aucun test ne voyait, puisque aucun test ne rend `/queues`
   * en anglais. La prop la referme sans toucher aux cinq autres appelants.
   */
  pagerLabels?: PagerLabels
}) {
  const [sort, setSort] = useState<SortState<string>>(null)
  const [query, setQuery] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [widths, setWidths] = useState<Record<string, number>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null)

  // #1672.5 — virtualisation : position de défilement + hauteur MESURÉE du
  // conteneur (`.wrap`). Ce state ne change jamais tant que `maxHeight` n'est
  // pas posé ou que le nombre de lignes reste sous le seuil — voir plus bas.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  const columnKeys = useMemo(() => columns.map(c => c.key), [columns])

  // Lecture UNE fois, après montage — jamais pendant le rendu (SSR n'a pas
  // `localStorage`, et lire pendant le rendu romprait l'hydratation).
  useEffect(() => {
    if (!persistKey || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(columnVisibilityStorageKey(persistKey))
      setHidden(parseHiddenColumns(raw, columnKeys))
    } catch {
      // Navigation privée, site data bloqué : le tableau garde toutes ses
      // colonnes visibles, exactement comme si `persistKey` n'était pas posé.
    }
    try {
      const raw = window.localStorage.getItem(columnWidthsStorageKey(persistKey))
      setWidths(parseColumnWidths(raw, columnKeys))
    } catch {
      // idem — largeur automatique, comme avant ce lot.
    }
    // Volontairement `[persistKey]` seul : une lecture UNE fois au montage,
    // pas à chaque rendu de `columnKeys` (recalculé chaque rendu tant que
    // l'appelant ne mémoïse pas son tableau `columns`, ce qu'aucun des 6
    // appelants existants ne fait aujourd'hui).
  }, [persistKey])

  function persistHidden(next: Set<string>) {
    setHidden(next)
    if (!persistKey || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(columnVisibilityStorageKey(persistKey), JSON.stringify([...next]))
    } catch {
      // Le choix reste actif pour cette session ; simplement pas mémorisé.
    }
  }

  function toggleColumn(key: string) {
    if (!canHideColumn(columnKeys, hidden, key)) return
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    persistHidden(next)
    if (sort?.key === key) setSort(null)
  }

  function persistWidthsNow(next: Record<string, number>) {
    if (!persistKey || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(columnWidthsStorageKey(persistKey), JSON.stringify(next))
    } catch {
      // idem — la largeur reste active pour cette session, pas mémorisée.
    }
  }

  function beginResize(e: PointerEvent<HTMLSpanElement>, key: string) {
    e.preventDefault()
    const th = e.currentTarget.closest('th')
    const measured = th?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTH_PX
    dragRef.current = { key, startX: e.clientX, startWidth: widths[key] ?? clampColumnWidth(measured) }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onResizeMove(e: PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current
    if (!drag) return
    const next = clampColumnWidth(drag.startWidth + (e.clientX - drag.startX))
    setWidths(prev => ({ ...prev, [drag.key]: next }))
  }

  function endResize() {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    setWidths(prev => {
      persistWidthsNow(prev)
      return prev
    })
  }

  function stepResize(key: string, direction: 1 | -1, currentWidthPx: number) {
    const next = { ...widths, [key]: clampColumnWidth(currentWidthPx + direction * RESIZE_STEP_PX) }
    setWidths(next)
    persistWidthsNow(next)
  }

  function onResizeKeyDown(e: KeyboardEvent<HTMLSpanElement>, key: string) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const th = e.currentTarget.closest('th')
    const current = widths[key] ?? clampColumnWidth(th?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTH_PX)
    stepResize(key, e.key === 'ArrowRight' ? 1 : -1, current)
  }

  const visibleColumns = useMemo(() => columns.filter(c => !hidden.has(c.key)), [columns, hidden])

  const searched = useMemo(() => {
    if (!searchValue) return rows
    return filterRowsByQuery(rows, query, searchValue)
  }, [rows, query, searchValue])

  const sorted = useMemo(() => {
    if (!sort) return searched
    const column = columns.find(c => c.key === sort.key)
    const accessor = column?.sortValue
    if (!accessor) return searched
    return [...searched].sort((a, b) => compareValues(accessor(a), accessor(b), sort.direction))
  }, [searched, columns, sort])

  // #1672.5 — au-delà du seuil, ET seulement si `maxHeight` donne un
  // conteneur réellement borné (sans lui, il n'y a pas de défilement interne
  // à mesurer : le calcul se dégraderait en « tout rendre », sans risque mais
  // sans gain non plus — voir docblock).
  const shouldVirtualize = Boolean(maxHeight) && sorted.length > VIRTUALIZE_ROW_THRESHOLD

  // Mesure le conteneur une fois qu'il existe, et à chaque redimensionnement
  // (fenêtre, panneau latéral qui s'ouvre…) — jamais pendant le rendu.
  useEffect(() => {
    if (!shouldVirtualize || typeof ResizeObserver === 'undefined') return
    const node = wrapRef.current
    if (!node) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setViewportHeight(entry.contentRect.height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [shouldVirtualize])

  function onWrapScroll(e: UIEvent<HTMLDivElement>) {
    if (!shouldVirtualize) return
    setScrollTop(e.currentTarget.scrollTop)
  }

  const virtualWindow: VirtualWindow | null = shouldVirtualize
    ? computeVirtualWindow({
        rowCount: sorted.length,
        rowHeightPx: ROW_HEIGHT_PX,
        scrollTop,
        viewportHeightPx: viewportHeight,
        overscan: 8,
      })
    : null

  // Les lignes RENDUES : soit toutes, soit la fenêtre calculée ci-dessus —
  // jamais un troisième chemin qui pourrait diverger du compte affiché.
  const renderedRows = virtualWindow ? sorted.slice(virtualWindow.startIndex, virtualWindow.endIndex) : sorted

  const hasActiveQuery = Boolean(searchValue) && query.trim().length > 0
  const tableState = resolveTableState({
    status,
    totalRows: rows.length,
    visibleRows: sorted.length,
    hasActiveQuery,
  })

  if (tableState.kind === 'loading') {
    return (
      <div className={styles['wrap'] ?? ''} style={maxHeight != null ? { maxHeight } : undefined}>
        <table className={styles['table'] ?? ''}>
          <thead>
            <tr>
              {columns.map(col => (
                // #1674.7 — `scope="col"` : un lecteur d'écran annonce la
                // colonne à chaque cellule, pas seulement au survol de l'en-tête.
                <th key={col.key} scope="col" className={col.align === 'right' ? (styles['num'] ?? '') : undefined}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: loadingRowCount }).map((_, i) => (
              <tr key={i}>
                {columns.map(col => (
                  <td key={col.key} className={col.align === 'right' ? (styles['num'] ?? '') : undefined}>
                    <Skeleton height={11} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tableState.kind === 'error') {
    return (
      <EmptyState
        icon="⚠"
        message={errorMessage ?? 'Le chargement a échoué.'}
        action={onRetry ? { label: 'Réessayer', onClick: onRetry } : undefined}
      />
    )
  }

  if (tableState.kind === 'empty') {
    return <EmptyState icon="◇" message={emptyMessage} />
  }

  // #1672.4 — pagination serveur : les QUATRE props ensemble, sinon pas de
  // pied de page (chemin inchangé pour les appelants qui ne les passent pas).
  const pagination: PaginationInfo | null =
    page != null && pageSize != null && total != null && onPageChange
      ? resolvePagination({ page, pageSize, total })
      : null

  const showToolbar = Boolean(searchValue || persistKey)

  return (
    <>
      {showToolbar ? (
        <div className={styles['toolbar'] ?? ''}>
          {searchValue ? (
            <div className={styles['search'] ?? ''}>
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className={styles['searchInput'] ?? ''}
              />
              <span className={styles['counter'] ?? ''}>
                {sorted.length} sur {rows.length}
              </span>
            </div>
          ) : null}
          {persistKey ? (
            <div className={styles['columnPicker'] ?? ''}>
              <button
                type="button"
                className="btn-sm"
                aria-expanded={pickerOpen}
                aria-controls={`${persistKey}-colonnes`}
                onClick={() => setPickerOpen(o => !o)}
              >
                Colonnes
              </button>
              <div
                id={`${persistKey}-colonnes`}
                className={styles['columnPickerPanel'] ?? ''}
                hidden={!pickerOpen}
                onKeyDown={e => {
                  if (e.key === 'Escape') setPickerOpen(false)
                }}
              >
                {columns.map(col => {
                  const isHidden = hidden.has(col.key)
                  return (
                    <label key={col.key} className={styles['columnPickerRow'] ?? ''}>
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        disabled={!canHideColumn(columnKeys, hidden, col.key)}
                        onChange={() => toggleColumn(col.key)}
                      />
                      {col.header}
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tableState.kind === 'empty-filtered' ? (
        <EmptyState
          icon="◇"
          message={`Aucun résultat pour « ${query.trim()} ».`}
          action={{ label: 'Effacer la recherche', onClick: () => setQuery('') }}
        />
      ) : (
        <>
          {tableState.kind === 'rows' && tableState.partial ? (
            <p className={styles['partialBanner'] ?? ''}>
              {partialMessage ?? 'Données partielles — certaines lignes peuvent manquer.'}
            </p>
          ) : null}
          <div
            ref={wrapRef}
            className={styles['wrap'] ?? ''}
            style={maxHeight != null ? { maxHeight } : undefined}
            onScroll={onWrapScroll}
          >
            <table className={styles['table'] ?? ''}>
              <colgroup>
                {visibleColumns.map(col => (
                  <col key={col.key} style={widths[col.key] ? { width: `${widths[col.key]}px` } : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((col, i) => (
                    // #1674.7 — `scope="col"` : un lecteur d'écran annonce la
                    // colonne à chaque cellule, pas seulement au survol de l'en-tête.
                    <th key={col.key} scope="col" className={col.align === 'right' ? (styles['num'] ?? '') : undefined}>
                      {col.sortValue ? (
                        <button
                          type="button"
                          className={styles['sortButton'] ?? ''}
                          onClick={() => setSort(s => nextSortState(s, col.key))}
                          aria-label={`Trier par ${col.header}`}
                        >
                          {col.header}
                          {sort?.key === col.key ? (
                            <span className={styles['sortArrow'] ?? ''} aria-hidden="true">
                              {sort.direction === 'asc' ? '▲' : '▼'}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        col.header
                      )}
                      {persistKey && i < visibleColumns.length - 1 ? (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Largeur de la colonne ${col.header}`}
                          tabIndex={0}
                          className={styles['resizeHandle'] ?? ''}
                          onPointerDown={e => beginResize(e, col.key)}
                          onPointerMove={onResizeMove}
                          onPointerUp={endResize}
                          onPointerCancel={endResize}
                          onKeyDown={e => onResizeKeyDown(e, col.key)}
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* #1672.5 — la ligne « vide » du haut comble exactement ce que
                    la fenêtre ne rend pas, pour que la barre de défilement ne
                    saute jamais. `aria-hidden` : elle ne porte aucune donnée. */}
                {virtualWindow && virtualWindow.topPaddingPx > 0 ? (
                  <tr aria-hidden="true">
                    <td
                      colSpan={visibleColumns.length}
                      style={{ height: virtualWindow.topPaddingPx, padding: 0, border: 0 }}
                    />
                  </tr>
                ) : null}
                {renderedRows.map(row => (
                  <tr key={rowKey(row)}>
                    {visibleColumns.map(col => (
                      <td key={col.key} className={col.align === 'right' ? (styles['num'] ?? '') : undefined}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
                {virtualWindow && virtualWindow.bottomPaddingPx > 0 ? (
                  <tr aria-hidden="true">
                    <td
                      colSpan={visibleColumns.length}
                      style={{ height: virtualWindow.bottomPaddingPx, padding: 0, border: 0 }}
                    />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* #1672.4 — pagination serveur : les quatre props ensemble, sinon
              rien ici — chemin inchangé pour les 6 appelants existants. */}
          {pagination && pagination.pageCount > 1 && page != null && total != null && onPageChange ? (
            <div className={styles['pager'] ?? ''}>
              <span className={styles['pagerRange'] ?? ''}>
                {pagerLabels.range(pagination.rangeStart, pagination.rangeEnd, total)}
              </span>
              <button
                type="button"
                className="btn-sm"
                disabled={!pagination.hasPrevious}
                onClick={() => onPageChange(page - 1)}
              >
                {pagerLabels.previous}
              </button>
              <button
                type="button"
                className="btn-sm"
                disabled={!pagination.hasNext}
                onClick={() => onPageChange(page + 1)}
              >
                {pagerLabels.next}
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
