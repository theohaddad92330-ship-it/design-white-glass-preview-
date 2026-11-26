import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4658 — `/analyse` → `/search`. La route du verbe principal du produit est `/search` ; l’adresse française se tape
 * de mémoire, se met en favori, se colle dans un message. Elle redirige (« on archive, on ne supprime pas ») au lieu
 * de rendre « Page introuvable ». `beforeLoad`, jamais `<Navigate>` (GA-27). Voisines : `/analyze`,
 * `/accounts/analyse` (`accounts/$id.tsx`).
 */
export const Route = createFileRoute('/analyse')({
  beforeLoad: () => {
    throw redirect({ to: '/search', replace: true })
  },
})
