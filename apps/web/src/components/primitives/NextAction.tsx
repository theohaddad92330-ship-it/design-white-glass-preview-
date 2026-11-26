import { nextActionLink, type NextActionRef } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * LA PROCHAINE ACTION — un LIEN, et le même partout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QU'IL REND (fiche de lecture des 17 écrans cibles, 26/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 *     « À garder — la colonne "prochaine action" sous forme de LIEN. C'est le
 *      meilleur élément de toutes les images, et ça doit devenir une règle du
 *      produit. »
 *
 * Un écran qui écrit « Typer les compétences » et s'arrête là a fait la moitié
 * du travail : il nomme le geste et cache l'endroit. Le lecteur ouvre trois
 * écrans pour trouver où ça se tape — ou, plus souvent, ne le fait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN COMPOSANT, ET PAS SEPT CELLULES
 * ─────────────────────────────────────────────────────────────────────────────
 * La colonne existe sur sept écrans. Sept rendus faits à la main donnent sept
 * tailles de texte, sept couleurs, sept réponses au cas « rien à faire » — et
 * six d'entre elles finissent en texte mort le jour où l'on ajoute une action.
 * C'est la loi 4 du tome 7 exactement à l'envers : la même forme rendue sept
 * fois différemment.
 *
 * La correspondance action → destination, elle, ne vit PAS ici : elle vit dans
 * `@bellum/contracts` (`nextActionLink`), à un seul endroit (GA-26). Ce fichier
 * ne décide de rien — il rend ce que la dérivation a décidé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Un lien mort.** Sans destination — rien à faire, ou l'écran EST déjà la
 *   destination — il rend du TEXTE. Un lien qui promet un geste sans l'ouvrir
 *   est pire qu'un texte : le texte ne promet rien.
 * · **Une phrase inventée quand il n'y a rien.** `action` à `null` et pas
 *   d'`emptyLabel` : il ne rend RIEN. « Aucune » n'est pas une action, et
 *   l'écran est seul à savoir s'il a la place de le dire.
 * · **Un `<div onClick>`.** Ce qui se clique se tabule (GA-35) : c'est un vrai
 *   `<a>`, avec son nom accessible et sa touche Entrée, sans rien à ajouter.
 */
export function NextAction({
  action,
  emptyLabel,
  size = 'sm',
  className,
  wrap = false,
  onClick,
}: {
  /** L'action et l'objet qu'elle concerne. `null` = il n'y a rien à faire. */
  action: NextActionRef | null
  /** Ce que l'écran écrit quand il n'y a rien à faire. Absent = rien du tout. */
  emptyLabel?: string
  /** `xs` dans une colonne dense, `sm` partout ailleurs. Rien d'autre : c'est
   *  l'échelle Tailwind, plancher à 12 px (D80). */
  size?: 'xs' | 'sm'
  className?: string
  /** #3559 — le libellé passe à la ligne au lieu de se couper par une ellipse : une colonne de
   *  tableau où la prochaine action DOIT se lire en entier. Défaut : `truncate`, inchangé. */
  wrap?: boolean
  /** Pour une ligne DÉJÀ cliquable, qui doit arrêter la propagation — sinon le
   *  geste demandé se perd derrière celui de la ligne. */
  onClick?: (event: MouseEvent) => void
}) {
  // Sans namespace fixe : les libellés vivent dans le namespace de LEUR domaine
  // et la clé le porte (`projects:…`, `accountMissions:…`). Un `useTranslation`
  // à namespace unique obligerait chaque écran à le repasser.
  const { t } = useTranslation()

  if (!action) {
    if (!emptyLabel) return null
    return (
      <Text element="span" size={size} className={`text-[var(--bellum-text-muted)] ${className ?? ''}`.trim()}>
        {emptyLabel}
      </Text>
    )
  }

  const link = nextActionLink(action)
  const label = t(link.labelKey)

  // Pas de destination : le geste se nomme, il ne s'ouvre pas.
  if (!link.route) {
    return (
      <Text
        element="span"
        size={size}
        title={label}
        // `inline-block` : un `<span>` en ligne ignore `overflow`/`max-width`, donc
        // l'ellipse qu'un appelant demande (cellule de tableau) ne s'engageait jamais.
        className={`inline-block align-bottom text-[var(--bellum-text-secondary)] ${className ?? ''}`.trim()}
      >
        {label}
      </Text>
    )
  }

  return (
    <Link
      to={link.route}
      params={link.params}
      onClick={onClick}
      title={label}
      // `--bellum-text-accent` et non une nuance FIXE de la gamme primaire :
      // aucune ne passe AA des deux côtés (D79). Au doigt, la cible fait 44 px
      // (GA-30) ; au curseur elle garde la hauteur de sa ligne.
      className={[
        'inline-flex min-w-0 text-[var(--bellum-text-accent)]',
        wrap ? 'items-start' : 'items-center',
        'underline decoration-transparent underline-offset-2 transition-colors',
        'hover:decoration-current focus-visible:decoration-current',
        'pointer-coarse:min-h-11',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* `element="span"` : la cellule est souvent déjà dans un `<p>`, et un
          `<p>` dans un `<p>` est du HTML invalide que le navigateur répare en
          coupant le paragraphe. Il hériterait par ailleurs de la borne de
          lecture à 70 caractères (D81), qui n'a aucun sens sur trois mots. */}
      <Text
        element="span"
        size={size}
        weight="medium"
        className={wrap ? 'min-w-0 whitespace-normal break-words' : 'truncate'}
      >
        {label}
      </Text>
    </Link>
  )
}
