import { create } from 'zustand'

/**
 * #2731.2 — le fil du scénario commercial, hors de l'écran qui l'affiche.
 *
 * Même décision que `product-tour-store.ts` : RIEN n'est persisté — un scénario
 * en cours est une SESSION, et il se relance autant qu'on veut (critère de
 * #2731). Le store ne navigue pas et ne lit aucune donnée : il tient un rang ;
 * c'est la barre, qui a le routeur et le client de requêtes, qui fait le reste.
 */
type SalesScenarioState = {
  active: boolean
  /** Rang de l'étape courante, base 0. La barre le borne au nombre d'étapes. */
  index: number
  start: () => void
  stop: () => void
  goTo: (index: number) => void
}

export const useSalesScenarioStore = create<SalesScenarioState>(set => ({
  active: false,
  index: 0,
  start: () => set({ active: true, index: 0 }),
  stop: () => set({ active: false, index: 0 }),
  goTo: index => set(state => (Number.isInteger(index) && index >= 0 ? { ...state, index } : state)),
}))
