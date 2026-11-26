import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { CreateMissionPage } from '@/features/missions/view/CreateMissionPage'

/**
 * « NOUVELLE MISSION » — `/missions/nouvelle` (#4196, épopée #4191, lot L5).
 *
 * La route est inchangée ; ce qu'elle monte a changé. Elle montait l'assistant de
 * BESOIN (et empruntait donc la garde de palier `needs`) : elle monte désormais le
 * formulaire de MISSION (`MissionCreateForm` → `POST /delivery/missions`), et suit
 * le régime des autres routes `/missions/*` — aucune garde de palier propre. Créer
 * une mission n'est pas un geste du Vivier ni des besoins.
 */
export const Route = createFileRoute('/missions/nouvelle')({
  // Lot X41 (#2958) — « Créer la mission » sur une opportunité signée porte le
  // projet d'où l'on vient : sans `validateSearch`, le routeur jetterait la
  // recherche avant que l'écran la voie. `.catch(undefined)` : un lien abîmé
  // ouvre l'entrée directe, jamais une page en erreur.
  validateSearch: z.object({ project_id: z.string().guid().optional().catch(undefined) }),
  component: CreateMission,
})

function CreateMission() {
  const { project_id: projectId } = Route.useSearch()
  return <CreateMissionPage fixedProjectId={projectId} />
}
