import type { TFunction } from 'i18next'
import type { ContactLifecycleTally, LauraContextFacet, LauraPageContext } from '@bellum/contracts'
import { buildContactFunnel } from '../lib/contactFunnel'

/**
 * #2309.33 — CE QUE L'ÉCRAN CONTACTS DÉCLARE À LAURA.
 *
 * Une fonction PURE, appelée par `ContactsPageContent` dans `useLauraContext` :
 * même règle que `vivierLauraContext` (consultants) — la déclaration vit avec
 * l'écran, se teste sans monter la liste, et ne recalcule rien que
 * `buildContactFunnel` (`contactFunnel.ts`) n'a déjà calculé (GA-26).
 *
 * « Non mesuré n'est pas zéro » : `lifecycleTally` absent (chargement ou
 * agrégat non servi) ne déclare ni total ni « prêts », `buildContactFunnel`
 * renvoie alors `null`. Un filtre qui ramène 0 contact n'est pas un stock
 * vide — seul un stock à zéro SANS aucun filtre posé l'est.
 */

type ContactsContextInput = {
  isLoading: boolean
  lifecycleTally: ContactLifecycleTally | undefined
  /** Recherche texte + filtres de barre posés, cumulés — 0 quand aucun. */
  activeFilterCount: number
}

export function contactsLauraContext(t: TFunction<'contacts'>, input: ContactsContextInput): LauraPageContext {
  const funnel = buildContactFunnel(input.lifecycleTally)
  const facets: LauraContextFacet[] = []
  if (funnel) {
    facets.push({ label: t('laura.total'), value: String(funnel.total) })
    const ready = funnel.stages.find(stage => stage.key === 'actionnable')
    if (ready) facets.push({ label: t('laura.ready'), value: String(ready.count) })
  }
  if (input.activeFilterCount > 0) {
    facets.push({ label: t('laura.filtersActive'), value: String(input.activeFilterCount) })
  }
  const emptyPool = funnel !== null && funnel.total === 0 && input.activeFilterCount === 0
  return {
    kind: 'screen',
    label: t('page.title'),
    entityId: null,
    facets,
    state: input.isLoading ? 'loading' : 'ready',
    purpose: t('laura.purpose'),
    ...(emptyPool ? { missing: [t('laura.emptyPool')] } : {}),
    actions: [t('page.addContact'), t('page.importContacts')],
  }
}
