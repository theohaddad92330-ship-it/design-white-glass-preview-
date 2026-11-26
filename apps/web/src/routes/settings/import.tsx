import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/import` n'est plus une page (#4533, Louis 24/10/2026) : les Imports sont l'onglet « Imports » de Mes
 * données. L'adresse reste, elle redirige — `beforeLoad` + `replace: true`, jamais `<Navigate>` (GA-27) : les liens
 * collés et les signets ne cassent pas. L'ancienne page ne lisait aucun paramètre de recherche (rien à conserver).
 * Revient sur la page Imports séparée ; l'accès reste réservé aux gestionnaires (onglet, `MyDataTabs`).
 */
export const Route = createFileRoute('/settings/import')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/mes-donnees', search: { tab: 'imports' }, replace: true })
  },
})
