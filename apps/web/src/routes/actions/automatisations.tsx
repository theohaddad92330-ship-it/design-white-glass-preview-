import { createFileRoute } from '@tanstack/react-router'
import { AutomationsPage } from '@/features/automations/view/AutomationsPage'

/**
 * `/actions/automatisations` — « Tes automatisations », le troisième onglet d'Actions.
 *
 * Décision Louis du 22/10/2026 (QCM C/D, maquettes Théo V22, `c130_actions_trois_onglets_automatisations_theo`) :
 * ⚠️ renverse c122 (19/10, la route redirigeait vers `/actions/sequences#sur-signal`) côté NAVIGATION ; le
 * moteur reste commun — une automatisation est une séquence déclenchée par un signal. Même palier que le reste
 * d'Actions : aucune clé de palier neuve.
 */
export const Route = createFileRoute('/actions/automatisations')({
  component: AutomationsPage,
})
