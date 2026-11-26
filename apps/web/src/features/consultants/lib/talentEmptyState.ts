/**
 * Ce que le vivier propose quand la recherche ne rend RIEN (manque A du
 * 30/08) — même esprit que `emptyListAction` côté comptes
 * (`apps/web/src/features/accounts/lib/emptyListAction.ts`), rejoué ici sans
 * sortir du périmètre de ce chantier.
 *
 * Le défaut qu'il ferme : l'écran ne distinguait que « une recherche est
 * posée » (`hasQuery`) de « aucune » — deux comptes qui ne sont pas des
 * consultants, tapées un filtre TJM ou une zone, tombaient toutes dans le
 * même message générique « Aucun talent ne correspond ». Un recruteur qui a
 * posé UN SEUL filtre trop strict ne sait alors pas LEQUEL relâcher.
 *
 *  - AUCUN axe actif : le vivier est réellement vide, le geste est d'ajouter
 *    un premier consultant ;
 *  - EXACTEMENT UN axe actif : il est NOMMÉ, pour qu'on sache lequel retirer ;
 *  - PLUSIEURS axes actifs : on ne sait plus lequel désigner seul, le geste
 *    générique (« Tout effacer », déjà dans la barre de rappel) reste.
 */

/**
 * Un axe de restriction posé sur le vivier — une pastille de `TalentFilters`
 * (recherche, compétences, TJM max, zone, disponibilité, séniorité) ou la vue
 * active. `id` n'est jamais lu par cette fonction : c'est l'appelant, qui a
 * la traduction, qui transforme `{id, value}` en phrase.
 */
export type NarrowingFilterAxis = { readonly id: string; readonly value: string }

/** Non exporté, comme `EmptyListAction` côté comptes : un appelant construit un
 *  littéral et TypeScript le vérifie STRUCTURELLEMENT, sans import — exporter
 *  ce nom violerait « un type consommé dans son seul fichier ne s'exporte
 *  pas » (`pnpm lint:exports:types`). */
type TalentEmptyAction = { kind: 'start' } | { kind: 'namedFilter'; axis: NarrowingFilterAxis } | { kind: 'filters' }

export function talentEmptyStateAction(axes: readonly NarrowingFilterAxis[]): TalentEmptyAction {
  if (axes.length === 1) return { kind: 'namedFilter', axis: axes[0]! }
  if (axes.length > 1) return { kind: 'filters' }
  return { kind: 'start' }
}
