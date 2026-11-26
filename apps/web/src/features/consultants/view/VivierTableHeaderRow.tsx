import { Checkbox, TableHead, TableHeader, TableRow, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { vivierColumnsFor, type VivierColumnId, type VivierColumnLayout } from './vivierTableColumns'

const COL_HEAD = 'h-11 py-2 whitespace-nowrap truncate text-sm font-medium text-[var(--bellum-text-muted)]'

/** Toutes les colonnes, dans l'ordre d'affichage — hors de `VivierTable` (tests). */
const ALL_COLUMNS = vivierColumnsFor(0)

/**
 * #2182.25 à .39 — L'ENTÊTE DU VIVIER.
 *
 * C'est CETTE ligne qui dimensionne le tableau : en `table-fixed`, les largeurs
 * de colonnes se lisent sur la première ligne. La liste des colonnes ET leur
 * largeur viennent de `VivierTable` (`vivierColumnsFor`, sur la largeur MESURÉE
 * du conteneur) — l'entête et chaque ligne lisent la même liste, elles ne
 * peuvent pas diverger d'une colonne (GA-29).
 *
 * #2737 (rouverte le 25/09/2026) — UN EN-TÊTE TIENT SUR UNE LIGNE.
 *
 * L'historique : #2500 (en-têtes qui se chevauchaient) a d'abord posé
 * `truncate`, puis #2500.1 l'a remplacé par `break-words` pour ne jamais
 * cacher de texte. Mais `break-words` dans une colonne de 3 % coupait les mots
 * LETTRE PAR LETTRE (« Co/m/pl/ét/ud/e », capture de Louis) : le libellé
 * restait « entier » et illisible. Le défaut n'était pas la classe, c'était la
 * largeur — une part en pourcentage ne promet rien à un mot.
 *
 * Désormais chaque colonne a un PLANCHER en pixels choisi pour que son en-tête
 * tienne sur une ligne, et une colonne qui n'a plus la place DISPARAÎT (sa
 * valeur se lit sur la fiche) au lieu d'écraser son libellé. L'en-tête est
 * donc `whitespace-nowrap` + ellipse + `title` : l'ellipse est un filet (une
 * traduction plus longue), jamais le régime normal — mesuré à 900, 1 100,
 * 1 280 et 1 512 px par `e2e/tests/web/vivier-table-layout.spec.ts`.
 *
 * #2662.1 — LA SÉLECTION MULTIPLE, dans la colonne « Nom ». `checked` porte
 * l'état indéterminé — trois états, jamais un booléen qui mentirait sur
 * « tout » ou « rien ».
 */
export function VivierTableHeaderRow({
  columns = ALL_COLUMNS,
  allSelected = false,
  someSelected = false,
  onToggleAll = () => {},
}: {
  /** Les colonnes rendues et leur largeur — `vivierColumnsFor` (#2737). */
  columns?: readonly VivierColumnLayout[]
  /** Toutes les lignes CHARGÉES (cette page) sont cochées. */
  allSelected?: boolean
  /** Au moins une, mais pas toutes — état indéterminé de la case. */
  someSelected?: boolean
  onToggleAll?: (selected: boolean) => void
} = {}) {
  const { t } = useTranslation('consultants')
  const labels: Record<VivierColumnId, string> = {
    name: t('table.headerName'),
    skills: t('table.headerSkills'),
    availability: t('table.headerAvailability'),
    location: t('table.headerLocation'),
    followUp: t('table.headerFollowUp'),
    actions: t('table.headerActions'),
  }
  const total = columns.reduce((sum, column) => sum + column.widthPx, 0)
  return (
    <TableHeader>
      <TableRow className="border-transparent hover:bg-transparent">
        {columns.map(column => (
          <TableHead
            key={column.id}
            data-column={column.id}
            className={cn(COL_HEAD, column.id === 'name' && 'pl-3')}
            // Une part de la largeur MESURÉE : la somme fait 100 %, le tableau
            // ne déborde jamais son conteneur.
            style={{ width: `${((column.widthPx / total) * 100).toFixed(3)}%` }}
            title={labels[column.id]}
          >
            {column.id === 'name' ? (
              <span className="flex min-w-0 items-center gap-2">
                {/* #2662.1 — sélection globale, sur les lignes CHARGÉES (cette
                    page) : cocher ne promet jamais d'agir sur un total serveur
                    que l'écran n'a pas sous les yeux. */}
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  aria-label={t('table.selectAllAria')}
                  onCheckedChange={checked => onToggleAll(checked === true)}
                />
                <span className="truncate">{labels.name}</span>
              </span>
            ) : column.id === 'actions' ? (
              // Le libellé reste pour le lecteur d'écran : la colonne ne porte
              // que des icônes nommées, « Actions » visible n'apprend rien.
              <span className="sr-only">{labels.actions}</span>
            ) : (
              labels[column.id]
            )}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  )
}
