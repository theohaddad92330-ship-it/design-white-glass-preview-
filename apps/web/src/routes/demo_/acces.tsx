import { createFileRoute } from '@tanstack/react-router'
import { DemoAccessPage } from '@/features/demo/view/DemoAccessPage'

/**
 * #2705.1 — le formulaire obligatoire avant la démo : `/demo/acces`.
 *
 * `DemoEntryPage` y envoie un visiteur dont le cookie ne porte aucun lead
 * connu, en reportant la query entière (`?t=` d'un environnement verrouillé,
 * UTM). Le `_` de `demo_` sort la route du gabarit de `/demo`, qui n'a pas
 * d'`<Outlet />` : imbriquée, elle ne se serait jamais affichée.
 *
 * `reason` — constat production du 27/09/2026 : `RedirectTo` y renvoie aussi
 * un visiteur dont la session de démonstration vient de tomber (401, appareil
 * révoqué, jeton expiré), avec `?reason=expired`, pour ne jamais l'envoyer
 * vers `/login` (voir `RedirectTo.tsx` et `demo-tab.ts`).
 */
export const Route = createFileRoute('/demo_/acces')({
  validateSearch: (search: Record<string, unknown>): { t?: string; reason?: 'expired' } => ({
    t: typeof search.t === 'string' ? search.t : undefined,
    reason: search.reason === 'expired' ? 'expired' : undefined,
  }),
  component: DemoAccessRoute,
})

function DemoAccessRoute() {
  const { t, reason } = Route.useSearch()
  return <DemoAccessPage token={t} reason={reason} />
}
