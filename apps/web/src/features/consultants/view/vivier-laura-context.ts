import type { TFunction } from 'i18next'
import type { LauraContextFacet, LauraPageContext } from '@bellum/contracts'

/**
 * #1904 — CE QUE LE VIVIER DÉCLARE À LAURA.
 *
 * Une fonction PURE, appelée par `ConsultantsPage` dans `useLauraContext` : la
 * déclaration vit avec l'écran (la règle de `laura-context.ts`), et se teste
 * sans monter sept cents lignes d'écran.
 *
 * Trois règles, chacune écrite dans le test :
 *  - « non mesuré n'est pas zéro » : une recherche qui n'a pas abouti ne dit ni
 *    un nombre ni « vide » ;
 *  - un filtre qui ne ramène rien n'est pas un vivier vide — le manque ne se
 *    déclare que sans critère posé ;
 *  - seul le geste que l'écran REND est déclaré (« Ajouter un consultant ») :
 *    l'import de base vit ailleurs, et le nommer ici promettrait un bouton
 *    absent.
 */

/** Borne du contrat : au-delà, le contexte ENTIER serait refusé et ne partirait pas. */
const FACET_VALUE_MAX = 160

type VivierContextInput = {
  isLoading: boolean
  /** Le total de la recherche courante — `null` quand elle n'a pas abouti. */
  total: number | null
  /** Au moins un critère est posé. */
  hasQuery: boolean
  /** Les critères posés, déjà rédigés pour l'écran (`narrowingAxes`). */
  filters: readonly string[]
}

export function vivierLauraContext(t: TFunction<'consultants'>, input: VivierContextInput): LauraPageContext {
  const facets: LauraContextFacet[] = []
  if (input.total !== null) {
    facets.push({ label: t(input.hasQuery ? 'laura.found' : 'laura.inPool'), value: String(input.total) })
  }
  // #1904.4 — les filtres actifs, nommés comme l'état vide les nomme.
  if (input.filters.length > 0) {
    facets.push({ label: t('laura.filters'), value: clip(input.filters.join(' · '), FACET_VALUE_MAX) })
  }
  const emptyPool = input.total === 0 && !input.hasQuery
  return {
    kind: 'screen',
    label: t('page.title'),
    entityId: null,
    facets,
    state: input.isLoading ? 'loading' : 'ready',
    purpose: t('laura.purpose'),
    ...(emptyPool ? { missing: [t('laura.emptyPool')] } : {}),
    actions: [t('add')],
    // #1904.9 — un vivier vide n'a qu'un seul geste rendu : le recommander
    // est honnête, ce n'est pas un rang calculé sur plusieurs options.
    ...(emptyPool ? { recommendedAction: t('add') } : {}),
  }
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
