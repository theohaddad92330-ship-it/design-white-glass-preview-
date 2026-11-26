import type { LucideIcon } from 'lucide-react'
import { memo, useState } from 'react'
import { chipClassName, chipCountClassName } from './chip-style'
import { cn } from '../lib/utils'

/**
 * LA rangée de filtres du produit — décision « F4 » du 01/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Trente écrans portaient une rangée de choix, sous TROIS formes qui ne
 * partageaient rien : un `<Button>` plein/contour en h-7 ou h-8 avec son
 * compteur en `<Badge>` ; un `<button>` maison `rounded-full` dont l'actif
 * était un `color-mix` à 16 % ; un `<button>` maison `h-8 rounded-[6px]` dont
 * la palette passait par un `style` en ligne. Quatre hauteurs, trois rayons,
 * deux façons de dire « actif », zéro composant partagé.
 *
 * Le défaut n'était pas qu'une des trois soit laide : c'est qu'en passant
 * d'un écran à l'autre, on ne reconnaissait pas le même objet.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES QUATRE DÉCISIONS QU'IL PORTE, ET CE QUI LES FONDE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. **Repos = fond CREUX, pas contour porteur.** Sur le fond blanc,
 *     `--bellum-border` fait 1,27:1 ; WCAG 1.4.11 exige 3:1 pour ce qui
 *     délimite un contrôle. Durcir le trait à #949499 sur les ~1 200 traits
 *     du produit était pire que le mal — le creux répond à la même question
 *     sans durcir quoi que ce soit, parce que la bordure cesse d'être la
 *     SEULE chose qui dit « ceci se clique ».
 *
 *  2. **Actif = `primary-500` plein + `--bellum-on-primary`, dans les DEUX
 *     thèmes.** Le réflexe serait de prendre l'accent du thème, mais
 *     `--bellum-text-accent` vaut `primary-300` en sombre : c'est une encre,
 *     pas un fond, et du blanc dessus donne 2,85:1. Mesuré, `primary-500` +
 *     blanc donne 6,37:1 en clair COMME en sombre. C'est le même piège que
 *     la règle D79, pris par l'autre bout.
 *
 *  3. **Le compte est un chiffre nu, jamais une bulle.** La bulle translucide
 *     de la maquette tombait à 4,11:1 sur le remplissage actif, et l'opacifier
 *     fait BAISSER le rapport (28 % → 3,62) puisque ça éclaircit le fond.
 *     Un chiffre en `--bellum-on-primary` plein : 6,37:1.
 *
 *  4. **Un compte non mesuré n'affiche RIEN.** `count: undefined` ⇒ aucun
 *     chiffre ; `count: 0` ⇒ un vrai zéro. C'est la doctrine du dépôt — « non
 *     mesuré n'est jamais 0 » — appliquée à une pastille : un « 0 » affiché
 *     pendant le chargement se lit « il n'y en a aucun ».
 */

export type FilterChipOption<TValue extends string = string> = {
  value: TValue
  /** Libellé déjà traduit — ce composant ne connaît pas i18n. */
  label: string
  /**
   * Le compte à droite du libellé.
   *
   * ⚠️ `undefined` n'est PAS zéro : il veut dire « pas mesuré », et rien ne
   * s'affiche. Passer `0` uniquement pour un zéro qu'on a vraiment compté.
   */
  count?: number
  icon?: LucideIcon
  /** Aide au survol — ce que la pastille retient exactement. */
  hint?: string
}

type BaseProps<TValue extends string> = {
  options: readonly FilterChipOption<TValue>[]
  /**
   * Le nom du GROUPE, pas d'une pastille. Sans lui, un lecteur d'écran
   * annonce sept boutons sans dire de quoi ils filtrent.
   */
  ariaLabel: string
  /**
   * LE NOM DE LA DIMENSION, VISIBLE — pas seulement pour les lecteurs d'écran.
   *
   * ⚠️ Sur `/contacts`, deux rangées se suivaient à 48 px l'une de l'autre, et
   * chacune ouvrait sur « Toutes » et « Tous ». Le retour #1418 le dit
   * exactement : *« plusieurs Tous / Toutes se ressemblent sans qu'on comprenne
   * immédiatement ce qu'ils filtrent »*. `ariaLabel` portait déjà la réponse
   * (« Filtrer par vue », « Filtrer par état du contact ») — mais aux seuls
   * lecteurs d'écran. Ceux qui voient l'écran n'y avaient pas droit.
   *
   * Optionnel : une rangée seule sur son écran n'a rien à désambiguïser, et un
   * intertitre y ajouterait du bruit.
   */
  legend?: string
  /** `sm` = 28 px (barre dense), `md` = 32 px (défaut). */
  size?: 'sm' | 'md'
  className?: string
  /**
   * Recette PR 12 (#4498.1) — une pastille au libellé long revient à la ligne DANS sa colonne au lieu de la
   * dépasser (`whitespace-nowrap` + `shrink-0` la faisaient recouvrir la colonne voisine d'une grille). Faux par
   * défaut : une rangée dense garde des pastilles d'une ligne ; les panneaux en grille le demandent.
   */
  wrapLabels?: boolean
  /**
   * #2979 — « voir plus » pour une rangée dont les valeurs viennent des DONNÉES
   * (agences, clients, consultants : 45 pastilles dans un seul panneau). Au-delà
   * de `after`, seules les premières et les ACTIVES restent visibles ; un bouton
   * déplie le reste. Absent = tout est rendu, comme avant (les 96 autres appelants
   * ne bougent pas). Les libellés sont fournis déjà traduits.
   */
  collapse?: { after: number; moreLabel: (hidden: number) => string; lessLabel: string }
}

type SingleProps<TValue extends string> = BaseProps<TValue> & {
  multiple?: false
  value: TValue | null
  onChange: (next: TValue | null) => void
  /**
   * Un second clic sur la pastille active la retire (`onChange(null)`).
   *
   * Faux par défaut, et c'est voulu : les vues d'un écran (Contacts, segments
   * du vivier) ont TOUJOURS une sélection — « aucune » n'y veut rien dire, et
   * un clic sur l'onglet courant viderait l'écran sans qu'on l'ait demandé.
   */
  clearable?: boolean
}

type MultipleProps<TValue extends string> = BaseProps<TValue> & {
  multiple: true
  values: readonly TValue[]
  /** Bascule — appelée aussi bien pour ajouter que pour retirer. */
  onToggle: (value: TValue) => void
}

type FilterChipsProps<TValue extends string> = SingleProps<TValue> | MultipleProps<TValue>

function FilterChipsImpl<TValue extends string>(props: FilterChipsProps<TValue>) {
  const { options, ariaLabel, legend, size = 'md', className, collapse, wrapLabels = false } = props
  const [expanded, setExpanded] = useState(false)

  // Une rangée vide occupe une hauteur et ne dit rien : elle laissait une
  // bande grise sur les écrans dont les facettes dépendent d'une donnée
  // absente.
  if (options.length === 0) return null

  const isActive = (value: TValue) => (props.multiple ? props.values.includes(value) : props.value === value)

  const activate = (value: TValue) => {
    if (props.multiple) {
      props.onToggle(value)
      return
    }
    if (props.value === value) {
      if (props.clearable) props.onChange(null)
      return
    }
    props.onChange(value)
  }

  const collapsible = collapse !== undefined && options.length > collapse.after
  const visibleOptions =
    collapsible && !expanded
      ? options.filter((option, index) => index < collapse.after || isActive(option.value))
      : options
  const hiddenCount = options.length - visibleOptions.length

  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {/* Le nom de la dimension, avant ses valeurs. `aria-hidden` : le groupe
          porte déjà `aria-label`, et l'annoncer deux fois ferait répéter la
          même chose à chaque tabulation. */}
      {legend ? (
        <span aria-hidden="true" className="mr-1 shrink-0 text-xs font-medium text-[var(--bellum-text-muted)]">
          {legend}
        </span>
      ) : null}
      {visibleOptions.map(option => {
        const active = isActive(option.value)
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.hint}
            onClick={() => activate(option.value)}
            /* La forme, la hauteur et les deux états viennent de `chip-style` —
               la MÊME grammaire que `TabNav variant="pill"`. Avant elle, le
               fond `--bellum-surface-2` disait « actif » chez l'un et « au
               repos » chez l'autre : la même couleur, deux sens opposés. */
            className={chipClassName({
              active,
              size,
              className: wrapLabels ? 'h-auto min-h-7 max-w-full shrink whitespace-normal py-1 text-left' : undefined,
            })}
          >
            {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
            <span>{option.label}</span>
            {/*
              Le compte : un chiffre nu, aligné en `tabular-nums` pour que les
              pastilles ne dansent pas d'un chargement à l'autre. `undefined`
              n'affiche rien — voir la décision n°4 en tête de fichier.
            */}
            {option.count === undefined ? null : <span className={chipCountClassName(active)}>{option.count}</span>}
          </button>
        )
      })}
      {collapsible && (hiddenCount > 0 || expanded) ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(open => !open)}
          className={cn(chipClassName({ active: false, size }), 'border-dashed')}
        >
          {expanded ? collapse.lessLabel : collapse.moreLabel(hiddenCount)}
        </button>
      ) : null}
    </div>
  )
}

/**
 * `memo` avec une signature générique : le cast conserve le paramètre de type
 * côté appelant, que `memo` efface autrement.
 */
export const FilterChips = memo(FilterChipsImpl) as typeof FilterChipsImpl
