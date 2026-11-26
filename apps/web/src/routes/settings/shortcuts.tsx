import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { PreferencesView } from '@/features/settings/view/PreferencesView'

/**
 * Réglages › Raccourcis clavier.
 *
 * Dans la section **Personnel** et non « Espace de travail » : un raccourci est
 * un réglage de PERSONNE. Deux commerciaux du même espace n'ont ni le même
 * clavier (⌘ ou Ctrl) ni les mêmes habitudes, et rien de ce qui se règle ici ne
 * touche ce que voient les autres — contrairement aux catalogues ou au lexique,
 * qui sont réservés aux gestionnaires pour cette raison exacte.
 */
export const Route = createFileRoute('/settings/shortcuts')({
  component: ShortcutsSettingsPage,
})

function ShortcutsSettingsPage() {
  return (
    <SettingsPage>
      {/* Théo D settings-prefs.R5 — l'adresse reste, la page est le sous-onglet « Raccourcis ». */}
      <PreferencesView initialTab="shortcuts" />
    </SettingsPage>
  )
}
