import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { SpaceBrandPage } from '@/features/settings/view/SpaceSettingsPages'

/**
 * Réglages › Marque & documents (marque blanche, 01/09/2026) — le nom, le logo et le domaine changent ce que TOUT
 * LE MONDE voit, et ce que voient les clients de l'espace. Maquette `settings-espace` (R5) : recentrée sur les documents.
 */
export const Route = createFileRoute('/settings/branding')({
  component: BrandingPage,
})

function BrandingPage() {
  return (
    <SettingsPage>
      <SpaceBrandPage />
    </SettingsPage>
  )
}
