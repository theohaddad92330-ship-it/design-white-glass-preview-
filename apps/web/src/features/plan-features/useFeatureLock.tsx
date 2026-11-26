import { useCallback, useState, type ReactNode } from 'react'
import type { PlanFeatureKey } from '@bellum/contracts'
import { PlanUpgradeDialog } from './PlanUpgradeDialog'
import { usePlanFeature } from './usePlanFeature'

type FeatureLock = {
  /** L'offre en cours n'ouvre pas cette fonction. */
  locked: boolean
  /** Classes à ajouter au contrôle pour le GRISER (sans le désactiver : un
   *  bouton mort ne dit rien, celui-ci ouvre la fenêtre d'upsell). */
  dimClassName: string
  /** Emballe le vrai gestionnaire : verrouillé ⇒ ouvre l'upsell au lieu
   *  d'exécuter l'action. */
  guard: <T extends unknown[]>(handler: (...args: T) => void) => (...args: T) => void
  /** La fenêtre à rendre dans l'arbre (no-op quand la fonction est ouverte). */
  dialog: ReactNode
}

/**
 * Griser un contrôle plutôt que le faire disparaître, et rendre le gris utile.
 *
 * Le réflexe serait de masquer ce que l'offre n'ouvre pas. C'est l'inverse de ce
 * qu'on veut : un commercial ne peut pas désirer ce qu'il ne voit pas, et une
 * interface qui change de forme selon l'offre est illisible d'un poste à
 * l'autre. Donc le bouton reste, grisé, et le clic ouvre ce qu'il faut savoir
 * pour l'obtenir — pas un toast d'erreur, pas un silence.
 *
 * Le doute n'interdit pas : tant que la charge crédits n'a pas répondu,
 * `locked` est faux et l'action part normalement (voir {@link usePlanFeature}).
 */
export function useFeatureLock(feature: PlanFeatureKey): FeatureLock {
  const { allowed } = usePlanFeature(feature)
  const [open, setOpen] = useState(false)
  const locked = !allowed

  const guard = useCallback(
    <T extends unknown[]>(handler: (...args: T) => void) =>
      (...args: T) => {
        if (locked) {
          setOpen(true)
          return
        }
        handler(...args)
      },
    [locked],
  )

  return {
    locked,
    dimClassName: locked ? 'opacity-50' : '',
    guard,
    dialog: locked ? <PlanUpgradeDialog feature={feature} open={open} onOpenChange={setOpen} /> : null,
  }
}
