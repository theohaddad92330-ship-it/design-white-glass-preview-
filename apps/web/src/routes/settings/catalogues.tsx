import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { spaceCataloguesSearchSchema } from '@/features/settings/model/hub-tabs'
import { SpaceCataloguesPage } from '@/features/settings/view/SpaceSettingsPages'

/**
 * Réglages › Catalogues & vocabulaire (BEL-CRM-105 + lexique D17).
 *
 * Maquette `settings-espace` (Théo V22, Louis 22/10/2026, R4) : une page à quatre onglets — Motifs de perte ·
 * Comptes écartés · Non-staffabilité · Vocabulaire. `/settings/lexicon` y renvoie (`?onglet=vocabulaire`).
 * Réservé aux gestionnaires, comme avant : renommer un motif change ce que TOUT LE MONDE voit dans ses sélecteurs.
 */
export const Route = createFileRoute('/settings/catalogues')({
  validateSearch: spaceCataloguesSearchSchema,
  component: CataloguesSettingsPage,
})

function CataloguesSettingsPage() {
  const { onglet } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsPage>
      <SpaceCataloguesPage
        tab={onglet ?? 'motifs-perte'}
        onTabChange={next => void navigate({ search: { onglet: next }, replace: true })}
      />
    </SettingsPage>
  )
}
