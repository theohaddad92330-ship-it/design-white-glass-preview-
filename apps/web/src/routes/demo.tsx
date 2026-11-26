import { createFileRoute } from '@tanstack/react-router'
import { DemoEntryPage } from '@/features/demo/view/DemoEntryPage'

/**
 * Public landing of the shared demo link: `/demo`.
 *
 * Le lien envoyé aux prospects est NU — rien à recopier à côté. `?t=` n'existe
 * que sur un environnement verrouillé par `DEMO_LINK_TOKEN` ; la clé reste alors
 * dans la query (jamais persistée côté client) et c'est le serveur qui tranche.
 * Voir `DemoEntryPage`.
 */
export const Route = createFileRoute('/demo')({
  validateSearch: (search: Record<string, unknown>): { t?: string } => ({
    t: typeof search.t === 'string' ? search.t : undefined,
  }),
  component: DemoRoute,
})

function DemoRoute() {
  const { t } = Route.useSearch()
  return <DemoEntryPage token={t} />
}
