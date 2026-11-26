import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { spacePerimetersSearchSchema } from '@/features/settings/model/hub-tabs'
import { SpacePerimetersPage } from '@/features/settings/view/SpaceSettingsPages'

/**
 * Réglages › Périmètres & sociétés (#2005.5 pour les périmètres, D9 pour les sociétés).
 *
 * Maquette `settings-espace` (Théo V22, Louis 22/10/2026, R2) : une page à deux onglets — Équipes & agences,
 * Sociétés. `/settings/legal-entities` y renvoie (`?onglet=societes`). La LECTURE reste ouverte à tout membre
 * (`@WorkspaceRead`) ; l'ÉCRITURE reste sous `team:manage`, côté API.
 */
export const Route = createFileRoute('/settings/business-units')({
  validateSearch: spacePerimetersSearchSchema,
  component: BusinessUnitsSettingsPage,
})

function BusinessUnitsSettingsPage() {
  const { onglet } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsPage>
      <SpacePerimetersPage
        tab={onglet ?? 'agences'}
        onTabChange={next => void navigate({ search: { onglet: next }, replace: true })}
      />
    </SettingsPage>
  )
}
