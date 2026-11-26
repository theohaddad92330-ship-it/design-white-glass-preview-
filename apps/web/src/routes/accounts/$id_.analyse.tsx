import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4789 — `/accounts/<id>/analyse` → le dossier du compte. Le verbe principal avait trois adresses rattrapées
 * (#4658 : `/analyze`, `/analyse`, `/accounts/analyze`) ; la forme AVEC identifiant rendait « Page introuvable »
 * sur un compte qu'on a sous les yeux. Alias, pas écran : l'analyse se relance depuis le dossier lui-même
 * (« on archive, on ne supprime pas »). `beforeLoad`, jamais `<Navigate>` (GA-27). `/analyze` (anglais) : voir
 * `$id_.analyze.tsx`.
 */
export const Route = createFileRoute('/accounts/$id_/analyse')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/accounts/$id', params: { id: params.id }, replace: true })
  },
})
