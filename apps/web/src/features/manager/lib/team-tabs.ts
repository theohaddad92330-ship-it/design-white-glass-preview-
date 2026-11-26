/**
 * Les onglets de l'espace Équipe (`/team`) et leurs sous-onglets — LA source, écrite une
 * fois. Aucune route neuve : l'onglet et le sous-onglet vivent dans l'adresse
 * (`/team?onglet=objectifs&sous=affaires`), si bien qu'un lien se partage et qu'un retour
 * arrière revient à l'onglet précédent. Une valeur inconnue retombe sur « Vue d'ensemble »
 * plutôt que de casser la route.
 */
export const TEAM_TABS = ['vue', 'objectifs', 'plans', 'recherches', 'activite', 'administration'] as const
export type TeamTab = (typeof TEAM_TABS)[number]

export const TEAM_SUBTABS = {
  objectifs: ['objectifs', 'affaires', 'portefeuilles'],
  activite: ['journal', 'echanges'],
} as const satisfies Partial<Record<TeamTab, readonly string[]>>

export type TeamSubtab = (typeof TEAM_SUBTABS)[keyof typeof TEAM_SUBTABS][number]

export function parseTeamTab(value: unknown): TeamTab {
  return TEAM_TABS.find(tab => tab === value) ?? 'vue'
}

/** Le sous-onglet demandé pour cet onglet — le premier quand il est absent ou n'est pas le sien. */
export function parseTeamSubtab(tab: TeamTab, value: unknown): TeamSubtab | undefined {
  const own: readonly TeamSubtab[] | undefined =
    tab in TEAM_SUBTABS ? TEAM_SUBTABS[tab as keyof typeof TEAM_SUBTABS] : undefined
  if (!own) return undefined
  return own.find(sub => sub === value) ?? own[0]
}
