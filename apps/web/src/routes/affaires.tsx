import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4710 — « Affaires » est le nom que le produit affiche dans sa navigation : l'adresse tapée ou gardée en favori
 * redirige vers la vraie route (/projects). `replace: true` — sinon « précédent » reboucle. `beforeLoad`, jamais
 * `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/affaires')({
  beforeLoad: () => {
    throw redirect({ to: '/projects', replace: true })
  },
})
