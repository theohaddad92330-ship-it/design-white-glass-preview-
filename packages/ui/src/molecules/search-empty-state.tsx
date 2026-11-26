import { Search, type LucideIcon } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { EmptyState } from './empty-state'

export type SearchEmptyStateProps = {
  title: string
  description: string
  icon?: LucideIcon
  /**
   * Le geste qui sort de l'état vide — un `<Link>` vers l'écran où l'on va
   * chercher de la matière, ou un `<button>` qui efface le filtre.
   *
   * Sans ce passe-plat, `SearchEmptyState` était un cul-de-sac PAR
   * CONSTRUCTION : `EmptyState`, sur lequel il est composé, expose `action`
   * depuis toujours, mais aucun écran ne pouvait l'atteindre. Ce n'était donc
   * pas un oubli d'écran — c'était une prop absente du composant, et les vingt
   * et quelques états vides du dépôt en héritaient tous.
   *
   * Optionnel, et à laisser vide quand il n'y a rien de vrai à proposer : un
   * échec de chargement n'a pas de cible (« réessaie » n'est pas une
   * destination), et une mauvaise porte est pire que pas de porte.
   */
  action?: ReactNode
}

/**
 * Placeholder à afficher quand un filtre / une recherche ne renvoie
 * aucun résultat — composé sur `EmptyState` pour rester aligné avec
 * les autres états vides.
 */
export const SearchEmptyState = memo<SearchEmptyStateProps>(function SearchEmptyState({
  title,
  description,
  icon: Icon = Search,
  action,
}) {
  return <EmptyState title={title} description={description} icon={<Icon className="size-7" />} action={action} />
})
