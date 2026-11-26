import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4658 — `/analyze` → `/search`. La route du verbe principal du produit est `/search` ; l'adresse anglaise se tape
 * de mémoire, se met en favori, se colle dans un message. Elle redirige (« on archive, on ne supprime pas ») au lieu
 * de rendre « Page introuvable ». `beforeLoad`, jamais `<Navigate>` (GA-27). Voisines : `/analyse`,
 * `/accounts/analyze` (`accounts/$id.tsx`).
 */
export const Route = createFileRoute('/analyze')({
  beforeLoad: () => {
    throw redirect({ to: '/search', replace: true })
  },
})
