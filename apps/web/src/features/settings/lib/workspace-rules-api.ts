import type { UpdateWorkspaceRules, WorkspaceRulesView } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2081.14 — les règles d'espace, côté client des Réglages.
 *
 * Deux routes, et aucune décision ici : `GET /workspaces/rules` (tout membre)
 * et `PATCH /workspaces/rules` (propriétaire ou administrateur — l'API le
 * re-vérifie et rend 403 sinon). Ce que chaque règle RETIRE est décidé par
 * l'API à l'endroit qui décide (guard d'export, périmètre des comptes),
 * jamais par cet écran.
 */
/** La clé de cache des règles — partagée par l'écran des Réglages et par `useDataExit` (`@/lib/data-exit`). */
export const WORKSPACE_RULES_KEY = ['settings', 'workspace-rules'] as const

export const workspaceRulesApi = {
  get(): Promise<WorkspaceRulesView> {
    return apiFetch<WorkspaceRulesView>({ path: '/workspaces/rules' })
  },
  update(patch: UpdateWorkspaceRules): Promise<WorkspaceRulesView> {
    return apiFetch<WorkspaceRulesView, UpdateWorkspaceRules>({
      path: '/workspaces/rules',
      method: 'PATCH',
      body: patch,
    })
  },
}
