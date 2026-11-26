import { Box, Table, TableBody } from '@bellum/ui'
import { PAGE_GUTTER_MX } from '@/components/page/page-gutter'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { ACCOUNTS_TABLE_CLASS } from './accountsTableShell'
import { AccountsCardList } from './AccountsCardList'
import { AccountsTableHeaderRow } from './AccountsTableHeaderRow'
import { AccountTableRow } from './AccountTableRow'
import type { AccountRow, SortKey } from './types'

type AccountsTableProps = {
  rows: AccountRow[]
  onDelete: (id: string) => void
  onArchive: (id: string) => void
  archivingId?: string | null
  sortKey: SortKey
  onSortKeyChange: (key: SortKey) => void
  /** Les comptes retenus pour une comparaison. `ReadonlySet` : le tableau LIT
   *  la sélection, il ne la détient pas — elle vit chez `AccountsPage`. */
  selectedIds: ReadonlySet<string>
  onSelectionChange: (id: string, selected: boolean) => void
  /** Coche/décoche toutes les lignes CHARGÉES d'un coup. */
  onToggleAll: (selected: boolean) => void
}

export function AccountsTable({
  rows,
  onDelete,
  onArchive,
  archivingId,
  sortKey,
  onSortKeyChange,
  selectedIds,
  onSelectionChange,
  onToggleAll,
}: AccountsTableProps) {
  // Combien de lignes CHARGÉES sont retenues. Dérivé ici, à un seul endroit :
  // « toutes » et « une partie » sont deux lectures du même comptage, et les
  // refaire dans l'entête les ferait diverger.
  const selectedOnPage = rows.filter(row => selectedIds.has(row.id)).length
  // #2097.62 — recette iPhone du 25/09 : sous 768px, la table étroite
  // (noms tronqués, défilement horizontal) cède la place à des cartes — voir
  // `AccountsCardList`. Desktop inchangé.
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <Box className={PAGE_GUTTER_MX}>
        <AccountsCardList rows={rows} />
      </Box>
    )
  }
  return (
    // `table-fixed` + `w-full` divides the overflow among the columns when the
    // viewport is narrower than the sum of the declared widths, crushing every
    // column at once. Le `min-w-` fait refuser le rétrécissement, si bien que
    // c'est l'ENVELOPPE qui défile — le même appariement conteneur-défile /
    // tableau-tient-sa-largeur que le tableau Équipe.
    // #1316.1 — « trop de scrolls internes : peu de comptes visibles ».
    //
    // Mesuré en production le 02/09, fenêtre de 861 px : cette enveloppe
    // demandait `max-h-[calc(100dvh-8rem)]` (733 px) et n'obtenait que **339 px
    // pour 2 156 px de contenu** — 15 % —, parce qu'elle vit dans un parent
    // DÉJÀ défilant (`CustomerPageContent`) qui l'écrase. Deux défilements
    // verticaux imbriqués : l'utilisateur ne sait pas lequel il fait bouger, et
    // le plus petit gagne toujours. Le dépôt connaît la règle, écrite pour le
    // mobile — elle vaut ici pour la même raison.
    //
    // ⚠️ `overflow-x-auto` RESTE : le tableau porte une largeur plancher et doit
    // défiler horizontalement dans SON conteneur, jamais dans le corps de la
    // page (D81). Seul le défilement VERTICAL part.
    <Box
      className={`overflow-x-auto rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] ${PAGE_GUTTER_MX}`}
    >
      {/* ⚠️ La classe et son plancher vivent dans `accountsTableShell.ts`, avec
          la raison du nombre — et le squelette lit la MÊME constante. Le
          commentaire qui vivait ici additionnait des colonnes disparues
          (« 96 (effectif) », « 144 (analyse) », « 192 (signal) ») : c'est ainsi
          que le plancher a survécu à la réduction des colonnes de #1417 et que
          la table a continué de déborder de 62 px (#1623). */}
      <Table className={ACCOUNTS_TABLE_CLASS}>
        <AccountsTableHeaderRow
          sortKey={sortKey}
          onSortKeyChange={onSortKeyChange}
          allSelected={rows.length > 0 && selectedOnPage === rows.length}
          someSelected={selectedOnPage > 0 && selectedOnPage < rows.length}
          onToggleAll={onToggleAll}
        />
        <TableBody>
          {rows.map(row => (
            <AccountTableRow
              key={row.id}
              row={row}
              onDelete={onDelete}
              onArchive={onArchive}
              isArchiving={archivingId === row.id}
              isSelected={selectedIds.has(row.id)}
              onSelectionChange={selected => onSelectionChange(row.id, selected)}
            />
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
