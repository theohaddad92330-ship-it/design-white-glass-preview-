import type { BriefingAction } from '@bellum/contracts'
import { Box } from '@bellum/ui'
import { PriorityCard } from './PriorityCard'

/**
 * #2097.43 — LE BLOC « PRÉPARATIONS » (position 4 de l'ordre mobile).
 *
 * Il ne recalcule rien : ce sont les MÊMES cartes `meeting_prep` que celles
 * qu'`ActionsBlock` aurait rendues (`PriorityCard`, GA-26 — jamais une
 * seconde forme pour le même objet), simplement regroupées à part quand
 * `BriefingPage` les en a retirées (sous 768px). Ni bandeau ni dépli : ce
 * n'est pas une liste bornée comme « À faire maintenant », juste les cartes
 * déjà sélectionnées par le serveur.
 */
export function PreparationsBlock({
  actions,
  onOpenMeetingPrep,
}: {
  actions: BriefingAction[]
  onOpenMeetingPrep: (actionId: string) => void
}) {
  return (
    <Box className="flex flex-col gap-2">
      {actions.map((action, index) => (
        <PriorityCard key={action.id} action={action} rank={index + 1} onOpenMeetingPrep={onOpenMeetingPrep} />
      ))}
    </Box>
  )
}
