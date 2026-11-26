import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4710 — « Signaux » est le nom que le produit affiche dans sa navigation : l'adresse tapée ou gardée en favori
 * redirige vers la vraie route (/signals). `replace: true` — sinon « précédent » reboucle. `beforeLoad`, jamais
 * `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/signaux')({
  beforeLoad: () => {
    throw redirect({ to: '/signals', replace: true })
  },
})
