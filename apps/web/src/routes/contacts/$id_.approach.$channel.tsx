import { createFileRoute } from '@tanstack/react-router'
import { ApproachPage } from '@/features/contacts/view/approach/ApproachPage'

/** Théo C6 — `/contacts/<id>/approach/<canal>` : la page « Préparer ton e-mail / ton message LinkedIn ». */
export const Route = createFileRoute('/contacts/$id_/approach/$channel')({
  component: ApproachRoute,
})

function ApproachRoute() {
  const { id, channel } = Route.useParams()
  return <ApproachPage contactId={id} channelParam={channel} />
}
