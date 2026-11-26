import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

/**
 * Louis 23/10 — « Mes cibles » n'a plus d'écran : Signaux (Théo) le remplace. L'ancienne adresse
 * (favoris, e-mails, liens de la doc) REDIRIGE : `?view=veilles` rouvre « Mes veilles »
 * (`/signals/watches`), le reste la bibliothèque (`/signals`).
 * #4545 (Louis 25/10) — les pistes ont quitté Signaux : l'ancre `#pistes` ouvre le panneau des pistes du Pipe
 * (`/projects?pistes=1`), elle n'est plus conservée.
 * `replace: true` — sinon « précédent » reboucle. `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
const mesCiblesSearchSchema = z.object({
  view: z.enum(['veilles']).optional().catch(undefined),
})

export const Route = createFileRoute('/mes-cibles/')({
  validateSearch: mesCiblesSearchSchema,
  beforeLoad: ({ search, location }) => {
    if (search.view === 'veilles') throw redirect({ to: '/signals/watches', replace: true })
    if ((location.hash ?? '').replace(/^#/, '') === 'pistes') {
      throw redirect({ to: '/projects', search: { pistes: 1 }, replace: true })
    }
    throw redirect({ to: '/signals', replace: true })
  },
})
