import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Théo C missions-encaissements.A4 — Paiements est FONDU dans la vue financière (maquette Théo V22,
 * refonte du 23/10/2026 : « Ce qui sort » y vit, Encaissements y renvoie). L'ancienne adresse reste
 * valide (liens enregistrés, routines) et y renvoie.
 */
export const Route = createFileRoute('/missions/paiements')({
  beforeLoad: () => {
    throw redirect({ to: '/missions/finance', hash: 'sorties', replace: true })
  },
})
