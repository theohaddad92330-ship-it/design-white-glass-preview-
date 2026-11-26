import { createFileRoute } from '@tanstack/react-router'
import { SequenceDetailRoutePage } from '@/features/outreach/view/SequenceDetailRoutePage'

// Théo C sequences-detail.R1 — même palier que /actions/sequences (voir sequences.tsx : pas de clé neuve).
export const Route = createFileRoute('/actions/sequences_/$id')({
  component: SequenceDetailRoute,
})

function SequenceDetailRoute() {
  const { id } = Route.useParams()
  return <SequenceDetailRoutePage id={id} />
}
