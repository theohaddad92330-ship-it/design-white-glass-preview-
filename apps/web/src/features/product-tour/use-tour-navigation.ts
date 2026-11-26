import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { PRODUCT_TOUR_STEPS } from './tour-steps'
import { useProductTourStore } from './product-tour-store'

/**
 * #1863.3 — LA PORTE UNIQUE DE « EMMÈNE-MOI SUR CET ÉCRAN ».
 *
 * Aller sur l'écran d'une étape, c'est TROIS gestes indissociables : poser le
 * rang, passer en phase « visite », naviguer. Deux surfaces le demandent — la
 * modale (« Ouvrir cet écran ») et la barre qui tient le fil (« Écran
 * suivant ») — et deux chemins qui refont la même dérivation divergent (loi 1
 * du tome 7, GA-26). Ici, il n'y en a qu'un.
 *
 * ⚠️ L'ORDRE COMPTE : le rang et la phase AVANT la navigation. La navigation
 * démonte l'écran courant ; si elle partait d'abord, la barre se monterait sur
 * le rang PRÉCÉDENT et afficherait l'étape d'avant pendant un rendu — le fil
 * visible dirait le contraire de l'écran affiché.
 *
 * Un rang hors bornes ne navigue nulle part : `goTo` le refuse déjà, et partir
 * quand même enverrait sur une route calculée depuis une étape inexistante.
 */
export function useTourNavigation(): (index: number) => void {
  const navigate = useNavigate()
  const goTo = useProductTourStore(state => state.goTo)
  const visit = useProductTourStore(state => state.visit)

  return useCallback(
    (index: number) => {
      const step = PRODUCT_TOUR_STEPS[index]
      if (!step) return
      goTo(index)
      visit()
      void navigate({ to: step.route })
    },
    [goTo, visit, navigate],
  )
}
