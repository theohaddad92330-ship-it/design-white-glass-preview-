import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/expenses/bareme` → Réglages › Mon espace › Règles métier › Frais.
 *
 * Décision Louis du 22/10/2026 (HT-5, maquette `settings-espace` amendée) : le barème de frais — interne et par
 * client, base de remboursement, date d'effet, plafonds, barème kilométrique — rejoint les règles métier de
 * l'espace. Il garde UN seul éditeur (`ExpensePolicyEditor`, GA-26) ; l'adresse survit pour ses liens entrants
 * (« on archive, on ne supprime pas »). `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/expenses/bareme')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/workspace-rules', search: { onglet: 'frais' }, replace: true })
  },
})
