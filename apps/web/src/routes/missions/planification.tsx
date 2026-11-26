import { createFileRoute } from '@tanstack/react-router'
import { PlanningPage } from '@/features/missions/view/PlanningPage'

export const Route = createFileRoute('/missions/planification')({
  component: PlanningPage,
})
