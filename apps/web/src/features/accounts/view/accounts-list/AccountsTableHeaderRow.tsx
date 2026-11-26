import { Box, Checkbox, TableHead, TableHeader, TableRow, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { SELECT_CELL, SELECT_SLOT } from './selection'
import { SortableTableHead } from './SortableTableHead'
import type { SortKey } from './types'

/**
 * ⚠️ `overflow-hidden` depuis le 06/09 (#1623) — un `<th>` NE CLIPPE PAS.
 *
 * Mesuré en production : « Dernière analyse » demandait 147 px de contenu pour
 * une boîte de 129, et les 18 px de trop se peignaient PAR-DESSUS l'entête
 * suivante. Les deux libellés se lisaient collés — « Dernière analyseSignal
 * dominant ». C'est le « chevauchement » du retour.
 *
 * La largeur de la colonne est corrigée juste en dessous ; ce clip est la
 * CEINTURE : il garantit qu'aucun libellé, dans aucune langue, ne pourra plus
 * repeindre la colonne voisine — l'anglais est plus court, mais la question se
 * reposera à chaque langue ajoutée, et personne ne la reposera.
 */
const COL_HEAD =
  'h-10 overflow-hidden whitespace-nowrap bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-muted)]'

interface AccountsTableHeaderRowProps {
  sortKey: SortKey
  onSortKeyChange: (key: SortKey) => void
  /** Toutes les lignes CHARGÉES sont cochées. */
  allSelected: boolean
  /** Au moins une, mais pas toutes — état indéterminé de la case. */
  someSelected: boolean
  onToggleAll: (selected: boolean) => void
}

export function AccountsTableHeaderRow({
  sortKey,
  onSortKeyChange,
  allSelected,
  someSelected,
  onToggleAll,
}: AccountsTableHeaderRowProps) {
  const { t } = useTranslation('accounts')
  return (
    <TableHeader>
      {/* Refonte Théo — `.a4-table` : Compte · Sujet & prochaine action · Relation · Personnes ·
          Responsable · Décision (l'« Intérêt » de Théo, écrit EN MOTS) · « … ». Les largeurs sont en rem et
          leur somme est le plancher de `accountsTableShell.ts` (GA-118). Accessibilité, grille de
          qualification et dernière analyse ne sont plus des colonnes : elles se lisent sous la Relation et
          sous la Décision qu'elles qualifient — rien n'est retiré de la ligne. */}
      <TableRow className="border-transparent hover:bg-transparent">
        <SortableTableHead
          label={t('table.company')}
          field="name"
          sortKey={sortKey}
          onSortKeyChange={onSortKeyChange}
          className={cn(COL_HEAD, 'w-auto rounded-l-card pl-4 md:w-64 md:pl-5')}
          /* La sélection globale porte sur les lignes CHARGÉES — jamais sur un
             total serveur qu'on n'a pas sous la main : cette liste est paginée
             (25/page, défilement infini). Même lecture que `/contacts`. */
          leading={
            <Box data-slot={SELECT_SLOT} className={SELECT_CELL}>
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                aria-label={t('table.selectAllAria')}
                onCheckedChange={checked => onToggleAll(checked === true)}
              />
            </Box>
          }
        />
        <TableHead className={cn(COL_HEAD, 'hidden w-64 md:table-cell')}>{t('table.subject')}</TableHead>
        <TableHead className={cn(COL_HEAD, 'hidden w-32 md:table-cell')}>{t('table.relation')}</TableHead>
        <TableHead className={cn(COL_HEAD, 'hidden w-28 md:table-cell')}>{t('table.people')}</TableHead>
        <TableHead className={cn(COL_HEAD, 'hidden w-28 md:table-cell')}>{t('table.owner')}</TableHead>
        {/* #4497 (V22) — « Intérêt » : le score AVEC ses axes (au clic), la décision et le verdict dessous.
            #2627.1 — triable. */}
        <SortableTableHead
          label={t('table.interest')}
          field="score"
          sortKey={sortKey}
          onSortKeyChange={onSortKeyChange}
          className={cn(COL_HEAD, 'w-40 min-w-40')}
        />
        {/* La colonne du « … » : rien à ÉCRIRE au-dessus d'un kebab, mais elle se NOMME pour un lecteur d'écran. */}
        <TableHead className={cn(COL_HEAD, 'w-20 rounded-r-card pr-4 text-right')}>
          <span className="sr-only">{t('table.rowActions')}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}
