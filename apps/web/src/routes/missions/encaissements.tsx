import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { CollectionsPage } from '@/features/missions/view/CollectionsPage'

const encaissementsSearchSchema = z.object({
  /**
   * `?client=<nom>` — la porte de la ligne « Pilotage › À traiter » regroupée par
   * client (recette 14/10) : la liste se resserre sur CE client. Un nom abîmé
   * ouvre l'écran entier plutôt qu'une page en erreur.
   */
  client: z.string().optional().catch(undefined),
})

function EncaissementsRoute() {
  const { client } = Route.useSearch()
  return <CollectionsPage client={client} />
}

export const Route = createFileRoute('/missions/encaissements')({
  validateSearch: encaissementsSearchSchema,
  component: EncaissementsRoute,
})
