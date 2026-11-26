import { useManagerStats } from './useManagerStats'

/**
 * Les actions ouvertes de l'ESPACE et celles en retard — la lecture que la tuile
 * « Actions à faire » du Cockpit de Pilotage relit. Elle vit ici parce que la
 * porte de données d'équipe n'est importée que depuis `features/manager`
 * (GA-254) : le Cockpit appelle ce crochet, jamais `useManagerStats`.
 *
 * `null` = pas lu (chargement, refus, API plus ancienne) — jamais « 0 ».
 */
export function useTeamOpenActions(): { open: number; overdue: number } | null {
  const { data } = useManagerStats()
  const actions = data?.shared_actions
  return actions ? { open: actions.open, overdue: actions.overdue } : null
}
