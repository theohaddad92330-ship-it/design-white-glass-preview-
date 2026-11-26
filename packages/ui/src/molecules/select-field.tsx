import { memo, useId } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/select'
import { cn } from '../lib/utils'

/**
 * LA liste déroulante du produit — décision « Q5 » du 01/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MESURE QUI L'A DÉCLENCHÉE
 * ─────────────────────────────────────────────────────────────────────────
 * 69 % des menus du produit étaient des `<select>` HTML natifs : 59 balises
 * sur 35 fichiers, contre 26 usages du composant `Select`. Le natif ne suit
 * NI le thème, NI le rayon, NI la police — son menu déroulant est rendu par
 * le système d'exploitation. C'est ce qui se voyait le plus en thème sombre :
 * une liste blanche qui s'ouvre au milieu d'un écran noir.
 *
 * Un écran allait jusqu'à forcer `style={{ background: '#1A1A24' }}` sur ses
 * `<option>` pour tenter de rattraper le coup — avec une couleur qui n'existe
 * dans aucun thème du dépôt, et qui n'aurait de toute façon rien changé sur
 * la plupart des navigateurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN COMPOSANT DE PLUS, ET PAS `Select` DIRECTEMENT
 * ─────────────────────────────────────────────────────────────────────────
 * `Select` est l'API composée de Radix : cinq balises imbriquées par menu.
 * Remplacer 59 `<select>` par 59 × 5 balises écrites à la main, c'est
 * recréer exactement le problème qu'on répare — cinquante-neuf occasions de
 * poser une hauteur, un rayon ou un `aria-label` différent.
 *
 * `SelectField` prend la forme du natif qu'il remplace (`value`, `onChange`,
 * une liste d'options) et décide tout le reste UNE fois.
 *
 * ⚠️ LE PIÈGE DE LA CHAÎNE VIDE. Un `<select>` natif exprimait « aucun
 * filtre » par `<option value="">`. Radix INTERDIT la chaîne vide comme
 * valeur d'item — elle est réservée à « rien de sélectionné », et lui en
 * passer une lève une erreur à l'exécution. Ce composant porte donc une
 * sentinelle interne : `emptyOption` rend un item réel côté Radix, et
 * `onChange` retourne bien `''` à l'appelant, qui n'a rien à savoir de tout
 * ça. Sans cette traduction, chaque migration aurait eu à réinventer la
 * même astuce, et l'une d'elles l'aurait ratée.
 */

/** La sentinelle Radix pour « aucune valeur ». Jamais exposée à l'appelant. */
const EMPTY_SENTINEL = '__bellum_empty__'

export type SelectFieldOption = {
  value: string
  label: string
  /** Une ligne d'explication, dans le menu ouvert seulement (jamais dans le déclencheur). */
  description?: string
  disabled?: boolean
  /** #3697.6 — opt-in PAR option : passe à la ligne au lieu de tronquer (#3712
   *  reste le défaut partout ailleurs). À réserver à un menu dont les libellés
   *  dépassent nettement la largeur habituelle du déclencheur. */
  wrap?: boolean
}

type SelectFieldProps = {
  value: string | undefined
  /** Reçoit `''` quand l'utilisateur choisit l'option vide. */
  onChange: (next: string) => void
  options: readonly SelectFieldOption[]
  /**
   * L'option « aucun / tous », celle que le natif écrivait
   * `<option value="">`. Absente ⇒ pas d'option vide.
   */
  emptyOption?: {
    label: string
    /** #3697 — même opt-in que `SelectFieldOption.wrap` : passe à la ligne
     *  au lieu de tronquer, quand ce libellé (affiché aussi comme
     *  PLACEHOLDER tant que rien n'est choisi) dépasse la largeur habituelle
     *  du déclencheur. */
    wrap?: boolean
  }
  /** Texte affiché quand rien n'est choisi. */
  placeholder?: string
  /**
   * Le nom du champ pour un lecteur d'écran, quand aucun `<Label htmlFor>`
   * ne le porte. L'un des deux est OBLIGATOIRE : un menu sans nom annonce
   * « bouton, réduit » et rien d'autre.
   */
  ariaLabel?: string
  /**
   * L'id du texte qui EXPLIQUE le champ — la raison pour laquelle il est vide
   * ou désactivé, par exemple. Sans lui, ce texte s'affiche à l'écran et reste
   * muet pour un lecteur d'écran ; c'est exactement ce qu'a failli perdre le
   * filtre d'entité de la finance en passant du natif à ce composant.
   */
  ariaDescribedBy?: string
  /** `sm` = 36 px (barre de filtres dense), `md` = 40 px (formulaire). */
  size?: 'sm' | 'md'
  disabled?: boolean
  id?: string
  className?: string
}

const SIZES = {
  sm: 'h-9',
  md: 'h-10',
} as const

function SelectFieldImpl({
  value,
  onChange,
  options,
  emptyOption,
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  size = 'md',
  disabled,
  id,
  className,
}: SelectFieldProps) {
  const fallbackId = useId()
  const fieldId = id ?? fallbackId

  return (
    <Select
      value={
        value === '' || value === undefined
          ? emptyOption || options.some(option => option.value === '')
            ? EMPTY_SENTINEL
            : // #3563.3 — `''` et non `undefined` : Radix lit `undefined` comme
              // « non contrôlé » puis passe en contrôlé au 1er choix (avertissement
              // React « uncontrolled to controlled », recette prod 02/10).
              // `''` = « rien de choisi », placeholder affiché, toujours contrôlé.
              ''
          : value
      }
      onValueChange={next => onChange(next === EMPTY_SENTINEL ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={fieldId}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className={cn(SIZES[size], className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyOption ? (
          // `data-value=""` : l'option vide porte la valeur qu'elle REND à
          // l'appelant, comme toutes les autres. Sans elle, le DOM disait
          // `null` là où le code dit `''`, et un test qui cherchait « aucun
          // filtre » ne trouvait rien.
          <SelectItem value={EMPTY_SENTINEL} data-value="" wrapLabel={emptyOption.wrap}>
            {emptyOption.label}
          </SelectItem>
        ) : null}
        {/*
          ⚠️ Une option peut porter la chaîne vide DANS la liste, et pas
          seulement via `emptyOption` : plusieurs vocabulaires du produit
          commencent par `''` pour « non renseigné » (`REMOTE_CHOICES`,
          `TRAVEL_CHOICES`…). Radix lève à l'exécution sur cette valeur. La
          sentinelle s'applique donc à TOUTE option vide, pas au seul cas
          nommé — sinon la migration réparait une moitié du piège et laissait
          l'autre exploser au premier rendu.
        */}
        {options.map(option => (
          /*
            `data-value` reproduit ce que `<option value>` donnait
            gratuitement : la valeur RENDUE, lisible depuis le DOM. Un
            `<select>` natif l'exposait, Radix la garde pour lui. Sans elle,
            aucun test ne peut désigner une option autrement que par son
            libellé traduit — et les vingt-cinq tests qui pilotaient ces menus
            désignaient tous une valeur.
          */
          <SelectItem
            key={option.value}
            value={option.value === '' ? EMPTY_SENTINEL : option.value}
            data-value={option.value}
            disabled={option.disabled}
            description={option.description}
            wrapLabel={option.wrap}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const SelectField = memo(SelectFieldImpl)
