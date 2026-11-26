import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { spaceRulesSearchSchema } from '@/features/settings/model/hub-tabs'
import { SpaceRulesPage } from '@/features/settings/view/SpaceSettingsPages'

/**
 * Réglages › Règles métier (ex « Règles d'espace », #2081.14, DÉCISION Louis 19/09/2026) — le SEUL endroit où
 * l'administrateur pose une règle qui prime sur les réglages individuels (GA-26). Tout membre la lit ; seul le
 * propriétaire ou un administrateur la change, et l'API le re-vérifie (403 sinon).
 *
 * Maquette `settings-espace` (Théo V22, Louis 22/10/2026, R3) : UNE page à sept onglets — Accès · Pipeline · Charge ·
 * Marché inversé · Frais · Marge · Qualité. Les cinq routes séparées (`pipeline`, `commercial-load`, `reverse-market`,
 * `finance`, `do-not-contact`) et `/expenses/bareme` y renvoient par `?onglet=` ; la grille de qualification (#3755)
 * vit dans l'onglet Qualité.
 */
export const Route = createFileRoute('/settings/workspace-rules')({
  validateSearch: spaceRulesSearchSchema,
  component: WorkspaceRulesPage,
})

function WorkspaceRulesPage() {
  const { onglet } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsPage>
      <SpaceRulesPage
        tab={onglet ?? 'acces'}
        onTabChange={next => void navigate({ search: { onglet: next }, replace: true })}
      />
    </SettingsPage>
  )
}
