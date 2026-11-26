import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { ActionLevelSettings } from '@/features/actions/components/ActionLevelSettings'
import { LauraModeSettingsView } from '@/features/settings/view/LauraModeSettingsView'

/**
 * Réglages › Laura › Comportement (ex « Laura — mode par défaut », #2451.9). Le mode de contexte par défaut de
 * l'espace est un repli pour un fil neuf, pas une règle d'espace (#2081.14 plafonne leur socle à deux). Tout membre
 * le LIT ; le CHANGEMENT reste propriétaire ou administrateur, l'API le re-vérifie.
 * Maquette `settings-laura` (Théo V22, Louis 22/10/2026) : contexte et profondeur, puis actions et autorisations.
 */
export const Route = createFileRoute('/settings/laura-mode')({
  component: LauraModeSettingsPage,
})

function LauraModeSettingsPage() {
  return (
    <SettingsPage>
      <LauraModeSettingsView />
      {/* #2896 / #2449.34 — le niveau d'action, réglé pour soi, sous le mode de l'espace. */}
      <ActionLevelSettings />
    </SettingsPage>
  )
}
