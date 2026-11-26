import type { AdminRightsMatrixEntry } from '@/lib/admin'

/**
 * #2445.4 (épopée #2766) — le mot COURT d'une permission, pour le badge de la
 * ligne. Les trois valeurs réelles sont les phrases complètes que
 * `app/services/tool_permissions.py` rend (`ToolPermission`, côté IA) — le mot
 * qui commence chacune. Une valeur non reconnue reste ELLE-MÊME plutôt qu'un
 * mot inventé : une quatrième permission qui apparaîtrait un jour se verrait,
 * elle ne se masquerait pas derrière un badge par défaut.
 */
export function courtPermission(permission: string): string {
  if (permission.startsWith('lecture')) return 'lecture'
  if (permission.startsWith('proposition')) return 'proposition'
  if (permission.startsWith('dépense')) return 'dépense'
  return permission
}

/**
 * Le résumé — combien d'outils dans chaque permission. Compté sur la MÊME
 * liste que la table rend, jamais une seconde source : un total qui diverge
 * de la liste en dessous est le défaut classique d'un résumé pré-calculé.
 */
export function compterParPermission(tools: AdminRightsMatrixEntry[]): {
  lecture: number
  proposition: number
  dépense: number
} {
  const compte = { lecture: 0, proposition: 0, dépense: 0 }
  for (const { permission } of tools) {
    const mot = courtPermission(permission)
    if (mot === 'lecture' || mot === 'proposition' || mot === 'dépense') compte[mot] += 1
  }
  return compte
}

/** Ordre alphabétique par nom d'outil — stable, sans muter le tableau reçu. */
export function trierParOutil(tools: AdminRightsMatrixEntry[]): AdminRightsMatrixEntry[] {
  return [...tools].sort((a, b) => a.tool.localeCompare(b.tool))
}
