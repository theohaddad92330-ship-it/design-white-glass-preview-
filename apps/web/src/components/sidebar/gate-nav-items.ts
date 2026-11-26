import type { SidebarSection } from './items'

/** #4158.9 — « au moins 2 membres ACTIFS » : `workspace.memberCount` compte les
 *  membres de l'espace, jamais les invitations en attente (listées à part par
 *  `GET /workspaces/me`). */
export const MIN_ACTIVE_MEMBERS_FOR_TEAM = 2

/**
 * Retire de la barre ce que l'appelant ne peut pas utiliser : les entrées
 * réservées aux gérants (« Pilotage »), et — #4158.9 — les entrées d'équipe
 * (`requiresTeam`) tant que l'espace est solo. La page et l'API appliquent la
 * même règle ; ceci garde seulement la navigation honnête.
 *
 * #4492 (PR 12C) — la MÊME porte vaut pour les sous-entrées : « Équipe » sous Ma journée reste aux
 * gérants d'un espace d'équipe ; un commercial y voit Ma journée · Mon agenda · Pilotage.
 */
export function gateNavItems(
  section: SidebarSection | undefined,
  { canManage, hasTeam }: { canManage: boolean; hasTeam: boolean },
): SidebarSection | undefined {
  if (!section) return section
  const allowed = (entry: { managerOnly?: boolean; requiresTeam?: boolean }) =>
    (canManage || !entry.managerOnly) && (hasTeam || !entry.requiresTeam)
  return {
    ...section,
    items: section.items
      .filter(allowed)
      .map(item => (item.subEntries ? { ...item, subEntries: item.subEntries.filter(allowed) } : item)),
  }
}
