import { Badge, cn, type BadgeProps } from '@bellum/ui'

/**
 * UNE PASTILLE DONT LE TEXTE PEUT DÉPASSER SA CELLULE — #1804 (résiduel).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT MESURÉ EN PRODUCTION LE 09/09/2026, SUR `/missions`
 * ─────────────────────────────────────────────────────────────────────────
 * Le premier correctif de #1804 (`e80b78fc2`) a posé un plancher `max-w-[…]`
 * sur chaque colonne, ET fait passer le nom de mission / de compte à la ligne
 * pour que ce plancher compte dans le calcul AUTO du `<table>`. Il restait
 * deux cellules dont le contenu n'est PAS du texte libre mais une pastille
 * (`<Badge>`) : « Risques » (`max-w-[10rem]`, 160 px déclarés, 182 px de
 * contenu mesuré) et « Prochaine action » (176 px déclarés, 187 px mesurés).
 * `overflow-x: visible` sur la cellule laissait le texte de la pastille
 * PEINDRE hors de sa cellule et se superposer à la colonne voisine — « les
 * deux illisibles ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `<Badge>` SEUL NE SUFFIT PAS, ET POURQUOI ON NE LE FAIT PAS PASSER
 * À LA LIGNE
 * ─────────────────────────────────────────────────────────────────────────
 * `badge.tsx` pose `whitespace-nowrap` — une pilule est mono-ligne PAR
 * CONSTRUCTION, un texte qui passerait à la ligne produirait un ovale bombé
 * plutôt qu'une pilule plus haute. Ce composant NE remet PAS cette règle en
 * cause : il ne touche pas `packages/ui`, et ne fait pas passer la pastille à
 * la ligne — c'est la seconde moitié de #1804 (« se tronquer proprement »)
 * qui s'applique ici, pas la première (« passer à la ligne »).
 *
 * Sans `overflow` déclaré, la largeur minimale de contenu qu'un ancêtre
 * (colonne de `<table>` en layout AUTO, ou parent flex qui doit réduire un
 * enfant) est tenu de lui accorder reste celle du texte ENTIER : avec
 * `white-space: nowrap`, min-content == max-content, aucune coupure n'étant
 * possible. La cellule se voit accorder sa borne déclarée (`max-w-[…]`), mais
 * la pastille, elle, continue de réclamer sa pleine largeur — et sans
 * `overflow: hidden` sur elle-même, elle peint l'excédent hors de sa propre
 * boîte plutôt que de le perdre.
 *
 * `overflow-hidden` change cela : la spec (CSS Overflow niveau 3, §3) fixe la
 * largeur minimale de contenu d'un élément à ZÉRO dès que son `overflow`
 * n'est plus `visible`, ce qui l'autorise enfin à être réduit sous ce qu'il
 * faudrait pour son texte. Mais `text-overflow: ellipsis` NE S'APPLIQUE PAS À
 * UN CONTENEUR FLEX (`Badge` est `inline-flex`) — d'où le `<span>` interne,
 * qui devient l'élément qui tronque réellement. Il hérite `min-width: 0` par
 * la règle globale déjà posée dans `index.css`
 * (`:where(.flex, .inline-flex, .grid, .inline-grid) > *`, puisque `Badge`
 * porte la classe `inline-flex`) et, en tant qu'item flex BLOCKIFIÉ (même
 * mécanisme documenté dans `badge.tsx` pour `w-fit`), devient un conteneur de
 * bloc valide pour l'ellipse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TEXTE COMPLET RESTE ACCESSIBLE
 * ─────────────────────────────────────────────────────────────────────────
 * La troncature CSS est PUREMENT VISUELLE : le nœud texte complet reste dans
 * le DOM, donc un lecteur d'écran l'annonce en entier même tronqué à l'écran.
 * Pour un pointeur, `title` porte la même chaîne — même geste que
 * `MissionMargin.tsx` (`title={t('table.marginCompleteHint')}`) dans cette
 * même feature — plutôt qu'un `Tooltip` Radix : la pastille n'est pas
 * interactive, et lui poser un `tabIndex` ferait tabuler CHAQUE pastille de
 * CHAQUE ligne d'un tableau dense pour un simple affichage.
 */
/**
 * #3494 — recette prod 01/10 : 19 textes sur 130 coupés (« Renouvellement non
 * engagé » 114 px pour 159 px, « Facturation bloquée ce mois-ci » 114/173).
 * La troncature par ellipse était LA CAUSE : elle cachait la valeur au lieu de
 * lui donner la place. La pastille PASSE À LA LIGNE dans la largeur que sa
 * colonne lui accorde (`whitespace-normal`, `max-w-full`) : le texte entier se
 * lit, et la colonne ne réclame plus sa largeur de texte sur une seule ligne.
 * Ce qui précède décrit l'ancienne mécanique (ellipse) — conservé pour
 * l'historique de #1804.
 */
/**
 * #3494 (recette prod 01/10) — « Démarrage » (50×32 px) sortait coupé en
 * « Démarra/ge » : `break-words` autorise la césure au milieu d'un mot. Jamais
 * de césure dans un badge : le retour à la ligne se fait aux ESPACES seulement
 * (`break-normal`), et un libellé d'un seul mot — un statut — n'a aucun point
 * de coupe légal : `whitespace-nowrap`, largeur au contenu.
 */
export function ClippedBadge({
  variant,
  children,
  oneLine = false,
}: {
  variant: BadgeProps['variant']
  /** #2979 (RBD) — une seule ligne, ellipse ; le libellé entier reste au `title`. Pour une cellule de
   *  tableau dense, où le retour à la ligne gonflait la ligne à ~101 px. */
  oneLine?: boolean
  /** Le libellé — une chaîne, jamais un nœud composé : `title` en a besoin. */
  children: string
}) {
  const singleWord = !/\s/.test(children.trim())
  return (
    <Badge
      variant={variant}
      title={children}
      className={cn(
        'h-auto break-normal rounded-lg text-left',
        oneLine
          ? 'min-w-0 max-w-full whitespace-normal'
          : singleWord
            ? 'w-max max-w-none whitespace-nowrap'
            : 'max-w-full whitespace-normal',
      )}
    >
      {/* Un mot seul : `shrink-0` + `min-w-fit` battent la règle globale
          `min-width: 0` des enfants flex (index.css) qui écrasait le span à
          50 px pour 62 px de texte — le badge prend la largeur du contenu. */}
      <span className={cn('break-normal', oneLine ? 'min-w-0' : singleWord ? 'min-w-fit shrink-0' : 'min-w-0')}>
        {children}
      </span>
    </Badge>
  )
}
