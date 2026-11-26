import type { LucideIcon } from 'lucide-react'
import { overlayGroupLabelClassName } from '@/components/layout/overlay'
import { globalSearchOptionId } from './global-search-option-id'

type GlobalSearchResultItem = {
  id: string
  primary: string
  secondary?: string | null
}

/**
 * UN groupe de résultats — un type d'entité, ses lignes.
 *
 * Rendu NUL quand `items` est vide : doctrine « on n'affiche pas ce qu'on n'a
 * pas » — dans une LISTE, une absence ne fait AUCUNE ligne, pas même une ligne
 * qui dirait « aucun compte ». Partagé par les sept groupes de la recherche
 * globale (#2207.67-74, épopée #3015) : sept rendus recopiés auraient fini par
 * diverger d'un détail (le padding d'une ligne, l'troncature d'un libellé).
 *
 * #3015 (recette du 25/09/2026) — `activeId` porte la ligne que ↑/↓ surligne
 * DANS `GlobalSearchDialog`, qui raisonne sur la liste APLATIE des sept
 * groupes (une flèche traverse les groupes, elle ne reste pas coincée dans
 * le premier). Ce composant ne connaît que SA part : il pose `id`/
 * `aria-selected` sur la ligne dont l'id apla­ti correspond, et rien de plus —
 * la navigation elle-même vit une fois, dans le composant qui voit tout.
 */
export function GlobalSearchResultGroup({
  groupKey,
  label,
  items,
  activeId,
  onSelect,
  icon: Icon,
  endLabel,
  hideLabel = false,
}: {
  /** La clé du domaine (`accounts`, `contacts`…) — compose l'id DOM avec
   *  celle de la ligne, voir `globalSearchOptionId`. */
  groupKey: string
  label: string
  items: readonly GlobalSearchResultItem[]
  /** L'id DOM (déjà composé, `globalSearchOptionId`) de la ligne surlignée
   *  par le clavier ailleurs sur l'écran — `undefined` quand aucune ligne
   *  de CE groupe n'est active. */
  activeId?: string
  onSelect: (id: string) => void
  /** Théo — `.menu-item` : l'icône du domaine, en tête de chaque ligne. */
  icon?: LucideIcon
  /** Théo — `.end` : ce que la ligne ouvre (« Ouvrir le dossier »), discret, à droite. Hors du nom accessible. */
  endLabel?: string
  /** L'intertitre reste pour le lecteur d'écran, pas à l'œil (la ligne « Demander à Laura » se suffit). */
  hideLabel?: boolean
}) {
  if (items.length === 0) return null

  return (
    <div className="flex flex-col" role="group" aria-label={label}>
      <p className={hideLabel ? 'sr-only' : overlayGroupLabelClassName}>{label}</p>
      <ul className="flex flex-col">
        {items.map(item => {
          const optionId = globalSearchOptionId(groupKey, item.id)
          const active = optionId === activeId
          return (
            <li key={item.id}>
              <button
                id={optionId}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(item.id)}
                className={`group flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] focus-visible:bg-[var(--bellum-surface-2)] focus-visible:outline-none pointer-coarse:min-h-11${active ? ' bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]' : ''}`}
              >
                {Icon ? (
                  <Icon
                    aria-hidden="true"
                    className={`size-4 shrink-0 ${active ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)]'}`}
                  />
                ) : null}
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className={`truncate font-medium ${active ? '' : 'text-[var(--bellum-text-primary)]'}`}>
                    {item.primary}
                  </span>
                  {item.secondary && (
                    <span aria-hidden="true" className="text-xs text-[var(--bellum-text-muted)]">
                      ·
                    </span>
                  )}
                  {item.secondary && (
                    // GA-255 — `shrink-0 truncate` seuls ne bornent rien : `max-w-`
                    // donne la largeur que la troncature borne réellement.
                    <span className="max-w-[14rem] shrink-0 truncate text-xs text-[var(--bellum-text-muted)]">
                      {item.secondary}
                    </span>
                  )}
                </span>
                {endLabel ? (
                  <span
                    aria-hidden="true"
                    className={`hidden shrink-0 text-xs text-[var(--bellum-text-muted)] md:inline ${active ? '' : 'md:invisible md:group-hover:visible'}`}
                  >
                    {endLabel}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
