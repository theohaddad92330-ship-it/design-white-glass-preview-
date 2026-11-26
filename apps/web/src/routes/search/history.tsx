import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Louis 23/10 — « Mes analyses » vit dans la recherche, comme une VUE (`/search?vue=historique`) :
 * l'ancienne adresse redirige. `replace: true` — sinon « précédent » reboucle. `beforeLoad`, jamais
 * `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/search/history')({
  beforeLoad: () => {
    throw redirect({ to: '/search', search: { vue: 'historique' }, replace: true })
  },
})
