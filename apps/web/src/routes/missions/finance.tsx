import { createFileRoute } from '@tanstack/react-router'
import { MissionsFinancePage } from '@/features/missions/view/MissionsFinancePage'

export const Route = createFileRoute('/missions/finance')({
  component: MissionsFinancePage,
})
