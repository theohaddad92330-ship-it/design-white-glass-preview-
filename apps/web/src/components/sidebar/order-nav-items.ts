import { orderNavForWorkspaceProfile, type WorkspaceProfile } from '@bellum/contracts'
import type { SidebarSection } from './items'

/**
 * #4270.2 (18/10) — la barre latérale d'un espace « forfait / conseil » : le
 * staffing passe au second plan. L'ORDRE seul change, jamais le contenu (c76) ;
 * sans profil (ou en staffing) la section revient INCHANGÉE, même référence.
 */
export function orderNavItems(
  section: SidebarSection | undefined,
  profile: WorkspaceProfile | null,
): SidebarSection | undefined {
  if (!section) return section
  const items = orderNavForWorkspaceProfile(section.items, profile, item => String(item.to))
  return items === section.items ? section : { ...section, items: [...items] }
}
