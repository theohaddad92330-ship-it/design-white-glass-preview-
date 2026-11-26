import {
  Box,
  HORIZONTAL_OVERSCROLL_CLASS,
  Text,
  cn,
  scrollEdgeClass,
  scrollRegionProps,
  useHorizontalOverflow,
} from '@bellum/ui'
import type { MouseEvent, ReactNode } from 'react'
import { useIsMobile } from '@/features/mobile/useIsMobile'

/**
 * Une colonne de tableau, et ce qu'elle devient sur un téléphone.
 */
type ResponsiveColumn<Row> = {
  key: string
  /** L'entête, en clair. Sert d'étiquette sur la carte mobile. */
  header: string
  render: (row: Row) => ReactNode
  /**
   * Le rang mobile : `title` en gras sur la première ligne, `meta` sous le
   * titre en gris, `field` en paire étiquette/valeur, `hidden` nulle part.
   *
   * ⚠️ Le défaut est `field` et non `hidden` : une colonne oubliée doit
   * s'AFFICHER de trop, pas disparaître. Une donnée absente d'un écran ne se
   * remarque jamais — c'est tout le sujet de ce dépôt.
   */
  mobile?: 'title' | 'meta' | 'field' | 'hidden'
  /**
   * Classes appliquées à la colonne en mode tableau — À SA CELLULE ET À SON
   * ENTÊTE.
   *
   * ⚠️ **L'entête a longtemps été oublié, et ça rendait toute LARGEUR
   * inopérante.** Un `<th>` participe au calcul de largeur d'un tableau au même
   * titre qu'un `<td>` : borner la seule cellule laisse l'entête réclamer ce
   * qu'il veut, et la colonne s'étale quand même. Mesuré le 04/09/2026 sur
   * `/missions/suivi` — la colonne « Mission » prenait 394 px sur 1 206 malgré
   * sa borne, et poussait la colonne d'action hors du champ visible. Les trois
   * autres colonnes du dépôt qui déclarent une largeur (`w-px`, `w-8` ×2) le
   * subissaient en silence depuis leur écriture.
   */
  className?: string
}

/** Un contrôle imbriqué garde SON geste : le clic qui l'atteint ne remonte pas en « clic de ligne ». */
const NESTED_CONTROL = 'a,button,input,select,textarea,label,[role="button"],[role="menuitem"],[role="link"]'

function rowClickHandler<Row>(row: Row, onRowClick?: (row: Row) => void) {
  if (!onRowClick) return undefined
  return (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element | null)?.closest?.(NESTED_CONTROL)) return
    onRowClick(row)
  }
}

/**
 * Un tableau qui devient une liste de cartes sous 768 px.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS SIMPLEMENT UN DÉFILEMENT HORIZONTAL
 * ─────────────────────────────────────────────────────────────────────────
 * C'est la réponse la plus rapide, et c'est la mauvaise. Un tableau de dix
 * colonnes qui défile latéralement sur un téléphone oblige à faire l'aller-
 * retour pour chaque ligne : on lit le nom à gauche, on glisse pour voir le
 * score, on a perdu le nom. La comparaison ligne à ligne — la seule raison
 * d'être d'un tableau — devient impossible.
 *
 * Une carte par ligne, en revanche, se lit d'un regard. Ce qu'on perd est la
 * comparaison ENTRE lignes ; ce qu'on gagne est la lisibilité de CHACUNE. Sur
 * un téléphone, c'est le bon échange : on ne compare pas trente comptes au
 * pouce, on en cherche un.
 *
 * L'entête reste rendue en mode tableau pour les lecteurs d'écran ; en mode
 * carte, chaque valeur porte son étiquette, ce qui remplit le même rôle.
 */
export function ResponsiveTable<Row>({
  rows,
  columns,
  rowKey,
  onRowClick,
  empty,
  className,
  scrollLabel,
  fixedLayout = false,
  dense = false,
}: {
  rows: readonly Row[]
  columns: readonly ResponsiveColumn<Row>[]
  rowKey: (row: Row) => string
  onRowClick?: (row: Row) => void
  /** Ce qui s'affiche quand il n'y a rien — jamais un tableau vide et muet. */
  empty?: ReactNode
  className?: string
  /** Le nom de la zone défilante — même contrat que `Table` de `@bellum/ui`.
   *  Sans lui la zone reste atteignable au clavier, sans se déclarer `region`. */
  scrollLabel?: string
  /**
   * R3b (08/10/2026) — mise en page FIXE : `table-fixed`, largeurs données par
   * les colonnes (en %), texte qui passe à la ligne. Le tableau ne peut plus
   * dépasser son parent : plus de défilement horizontal, quel que soit le
   * contenu (recette prod 1512 px : +55 px et +77 px malgré deux correctifs).
   */
  fixedLayout?: boolean
  /**
   * #2979 — padding vertical des cellules réduit (`py-1` au lieu de `py-2`) : une ligne dense
   * tient sous 56 px là où `py-2` en ajoutait 8 de plus à la plus haute boîte. Bureau seulement :
   * sous 768 px les cartes (`p-3`, `min-h-11`) ne bougent pas.
   */
  dense?: boolean
}) {
  const isMobile = useIsMobile()
  // Le SECOND tableau partagé du produit, et il ne partage pas le balisage du
  // premier : sans cette dérivation commune (`@bellum/ui`), la règle « ce qui
  // déborde reste atteignable » vivrait à deux endroits, et GA-119 serait
  // borgne sur celui des deux qu'elle n'aurait pas rendu.
  const { ref: viewportRef, overflowing, start, end } = useHorizontalOverflow<HTMLElement>()

  if (rows.length === 0) return <>{empty ?? null}</>

  if (!isMobile) {
    return (
      <Box
        ref={viewportRef}
        {...scrollRegionProps(overflowing, scrollLabel)}
        className={cn(
          // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
          'w-full overflow-x-auto',
          HORIZONTAL_OVERSCROLL_CLASS,
          overflowing &&
            'outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-text-accent)] focus-visible:ring-offset-0',
          scrollEdgeClass(start, end),
          className,
        )}
      >
        <table className={cn('w-full text-sm', fixedLayout && 'table-fixed')}>
          <thead>
            <tr className="border-b border-[var(--bellum-border)] text-left">
              {columns.map(column => (
                <th
                  key={column.key}
                  // #4191 (E3) — un en-tête ne se coupe JAMAIS au milieu d'un mot (« Renouvell/ement ») : pas
                  // de `break-words` ici, il reste réservé aux cellules (texte libre). La colonne réserve
                  // une largeur qui tient son mot le plus long.
                  className={cn('px-3 py-2 text-xs font-normal text-[var(--bellum-text-muted)]', column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={rowKey(row)}
                onClick={rowClickHandler(row, onRowClick)}
                className={cn(
                  'border-b border-[var(--bellum-border)] last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-[var(--bg-elevated)]',
                )}
              >
                {columns.map(column => (
                  <td
                    key={column.key}
                    className={cn('px-3', dense ? 'py-1' : 'py-2', fixedLayout && 'break-words', column.className)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    )
  }

  const titles = columns.filter(column => column.mobile === 'title')
  const metas = columns.filter(column => column.mobile === 'meta')
  const fields = columns.filter(column => (column.mobile ?? 'field') === 'field')

  return (
    <Box className={cn('space-y-2', className)}>
      {rows.map(row => (
        <Box
          key={rowKey(row)}
          onClick={rowClickHandler(row, onRowClick)}
          // 44 px de haut minimum : la cible tactile recommandée. Une carte
          // plus courte se rate, et sur une liste on rate la voisine.
          className={cn(
            'min-h-11 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3',
            onRowClick && 'cursor-pointer active:bg-[var(--bg-elevated)]',
          )}
        >
          {titles.map(column => (
            <Box key={column.key} className="font-medium">
              {column.render(row)}
            </Box>
          ))}
          {metas.length > 0 && (
            <Box className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[var(--bellum-text-muted)]">
              {metas.map(column => (
                <Box key={column.key}>{column.render(row)}</Box>
              ))}
            </Box>
          )}
          {fields.length > 0 && (
            <Box className="mt-2 space-y-1">
              {fields.map(column => (
                <Box key={column.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {column.header}
                  </Text>
                  <Box className="min-w-0 text-right">{column.render(row)}</Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}
