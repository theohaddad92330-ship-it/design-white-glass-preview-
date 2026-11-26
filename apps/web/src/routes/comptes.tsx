import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4710 — « Comptes » est le nom que le produit affiche dans sa navigation : l'adresse tapée ou gardée en favori
 * redirige vers la vraie route (/accounts). `replace: true` — sinon « précédent » reboucle. `beforeLoad`, jamais
 * `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/comptes')({
  beforeLoad: () => {
    throw redirect({ to: '/accounts', replace: true })
  },
})
