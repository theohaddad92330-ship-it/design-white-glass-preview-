import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4710 — « Découvrir » est le nom que le produit affiche dans sa navigation : l'adresse tapée ou gardée en favori
 * redirige vers la vraie route (/discover). `replace: true` — sinon « précédent » reboucle. `beforeLoad`, jamais
 * `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/decouvrir')({
  beforeLoad: () => {
    throw redirect({ to: '/discover', replace: true })
  },
})
