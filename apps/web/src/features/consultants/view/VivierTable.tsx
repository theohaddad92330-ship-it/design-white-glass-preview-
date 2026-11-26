import { Table, TableBody } from '@bellum/ui'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TalentRow } from '@bellum/contracts'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { VivierCardList } from './VivierCardList'
import { VivierTableHeaderRow } from './VivierTableHeaderRow'
import { VivierTableRow } from './VivierTableRow'
import { VIVIER_TABLE_SHELL, vivierColumnsFor } from './vivierTableColumns'

/**
 * #2182.25 à .39 — LE TABLEAU DENSE DU VIVIER.
 *
 * #2737 (rouverte le 25/09/2026) — LE TABLEAU SE RÈGLE SUR SON CONTENEUR.
 *
 * Il mesure la largeur de SON conteneur (`ResizeObserver`), pas celle de la
 * fenêtre : la barre latérale, le panneau de correspondance ouvert (#2526) et
 * la gouttière mangent une place qu'aucun palier de viewport ne voit. Les
 * colonnes se choisissent sur cette mesure, par priorité (`vivierColumnsFor`) ;
 * la somme de leurs largeurs vaut la mesure — `table-fixed` fait le reste, le
 * tableau ne déborde jamais (#2465 : 392 px hors du champ sur `/contacts`).
 *
 * Sous 768 px (la borne mobile unique, GA-28), le vivier se lit en CARTES : un
 * tableau de quatre colonnes sur 343 px n'est pas un tableau.
 *
 * `useLayoutEffect` : la première mesure a lieu AVANT la première peinture, le
 * tableau n'apparaît jamais avec toutes ses colonnes pour en perdre ensuite.
 */
export function VivierTable({
  rows,
  onEdit,
  onDelete,
  onOpenSkills,
  onOpenRecord,
  onCompare,
  onArchive,
  onToggleFavorite,
  // Théo C talents-vivier.R10 — « Liste » ou « Cartes » : la même donnée, deux lectures.
  layout = 'list',
  // #2662.1 — sélection multiple. La case tient DANS la colonne « Nom ».
  selectedIds,
  onToggleAll,
  onToggleRow,
}: {
  rows: readonly TalentRow[]
  onEdit: (row: TalentRow) => void
  onDelete: (row: TalentRow) => void
  onOpenSkills: (row: TalentRow) => void
  /** #4194 — ouvre le panneau latéral unique sur ce consultant. */
  onOpenRecord?: (id: string) => void
  onCompare?: (row: TalentRow) => void
  onArchive?: (row: TalentRow) => void
  onToggleFavorite?: (row: TalentRow) => void
  /** Les identifiants cochés — sur les lignes CHARGÉES (cette page). */
  selectedIds?: ReadonlySet<string>
  onToggleAll?: (selected: boolean) => void
  onToggleRow?: (id: string, selected: boolean) => void
  /** « Liste · Cartes » de la barre d'outils (maquette `.bo11-switch`). Le téléphone lit toujours des cartes. */
  layout?: 'list' | 'cards'
}) {
  const isMobile = useIsMobile()
  const { ref, width } = useContainerWidth(isMobile || layout === 'cards')
  const columns = useMemo(() => vivierColumnsFor(width), [width])
  const selection = selectedIds ?? new Set<string>()
  const allSelected = rows.length > 0 && rows.every(row => selection.has(row.id))
  const someSelected = !allSelected && rows.some(row => selection.has(row.id))

  if (isMobile || layout === 'cards') {
    return (
      <VivierCardList
        grid={!isMobile}
        rows={rows}
        onEdit={onEdit}
        onDelete={onDelete}
        onOpenSkills={onOpenSkills}
        onOpenRecord={onOpenRecord}
        onCompare={onCompare}
        onArchive={onArchive}
        onToggleFavorite={onToggleFavorite}
        selectedIds={selection}
        onToggleRow={onToggleRow}
      />
    )
  }

  return (
    <div ref={ref} className="w-full min-w-0">
      <Table className={VIVIER_TABLE_SHELL}>
        <VivierTableHeaderRow
          columns={columns}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleAll={onToggleAll}
        />
        <TableBody>
          {rows.map(row => (
            <VivierTableRow
              key={row.id}
              row={row}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenSkills={onOpenSkills}
              onOpenRecord={onOpenRecord}
              onCompare={onCompare}
              onArchive={onArchive}
              onToggleFavorite={onToggleFavorite}
              columns={columns}
              isSelected={selection.has(row.id)}
              onSelectionChange={selected => onToggleRow?.(row.id, selected)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * La largeur intérieure d'un conteneur, suivie. `0` tant qu'elle n'est pas
 * mesurée (jsdom ne met rien en page) — `vivierColumnsFor(0)` rend alors
 * toutes les colonnes.
 */
function useContainerWidth(isMobile: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    // Arrondi au pixel : un sous-pixel qui oscille ne re-rend pas vingt lignes.
    const measure = () => setWidth(Math.floor(element.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [isMobile]) // la carte ne monte pas le conteneur : re-mesurer au retour en tableau
  return { ref, width }
}
