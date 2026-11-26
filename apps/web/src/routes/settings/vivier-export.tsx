import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/vivier-export` n'est plus une page (#4532, Louis 24/10/2026 — revient sur #3950, 08/10) : « Exporter le
 * vivier » est une carte de l'onglet Exports de Mes données. L'adresse redirige (`beforeLoad` + `replace: true`,
 * jamais `<Navigate>` — GA-27).
 */
export const Route = createFileRoute('/settings/vivier-export')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/mes-donnees', replace: true })
  },
})
