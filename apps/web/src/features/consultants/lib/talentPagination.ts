import { TALENT_BULK_MAX } from '@bellum/contracts'

/**
 * La pagination NUMÉROTÉE du vivier (écran Vivier, PDF-22 §01).
 *
 * L'écran n'avait que Précédent/Suivant : pour atteindre la page 40, il
 * fallait 39 clics. La maquette montre des numéros cliquables, avec des
 * points de suspension au-delà d'une poignée de pages — cette fonction PURE
 * calcule quoi afficher, testable sans monter le composant.
 */
/** #3781 — la dernière taille est « tout le monde » : la borne d'un lot (`TALENT_BULK_MAX`),
 *  pour qu'une sélection de page puisse couvrir un vivier entier sans paginer. */
export const TALENT_PAGE_SIZE_OPTIONS = [20, 50, 100, TALENT_BULK_MAX] as const
export const TALENT_DEFAULT_PAGE_SIZE = 20

/** Un numéro de page, ou une coupure représentée par `null` (« … »). Non
 *  exporté : ce type ne sert qu'à ce fichier, `knip` refuse un type exporté
 *  sans consommateur externe. */
type PaginationEntry = number | null

/** En dessous de ce nombre de pages, les afficher TOUTES vaut mieux qu'une
 *  coupure qui ne gagne presque rien en largeur. */
const MAX_PAGES_WITHOUT_ELLIPSIS = 7

/**
 * Les pages à afficher — toujours la première et la dernière, la page
 * courante et sa voisine immédiate de chaque côté, jamais deux `null`
 * consécutifs (une coupure ne se répète pas).
 */
export function talentPaginationRange(page: number, lastPage: number): PaginationEntry[] {
  if (lastPage <= 1) return [1]
  if (lastPage <= MAX_PAGES_WITHOUT_ELLIPSIS) {
    return Array.from({ length: lastPage }, (_, index) => index + 1)
  }
  const wanted = new Set<number>([1, lastPage, page])
  if (page > 1) wanted.add(page - 1)
  if (page < lastPage) wanted.add(page + 1)

  const sorted = [...wanted].filter(value => value >= 1 && value <= lastPage).sort((a, b) => a - b)
  const entries: PaginationEntry[] = []
  for (let index = 0; index < sorted.length; index += 1) {
    const value = sorted[index] as number
    const previous = sorted[index - 1]
    if (previous !== undefined && value - previous > 1) entries.push(null)
    entries.push(value)
  }
  return entries
}
