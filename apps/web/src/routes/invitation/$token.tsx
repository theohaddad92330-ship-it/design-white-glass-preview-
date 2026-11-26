import { createFileRoute } from '@tanstack/react-router'
import { AcceptInvitationView } from '@/features/team/view/AcceptInvitationView'

export const Route = createFileRoute('/invitation/$token')({
  component: AcceptInvitationView,
})
