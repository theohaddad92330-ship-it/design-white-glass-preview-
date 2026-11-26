import type { UpdateWorkspaceDefaultContextMode, WorkspaceDefaultContextModeResolution } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2451.9 — le mode de contexte par défaut de l'espace, côté client. UN seul
 * appelant de cette route (GA-26) : `LauraModeSettingsView` (Réglages) pour le
 * changer, `ContextModeSelector` (composeur de Laura) pour le LIRE et nourrir
 * `contextModeFor` d'un repli qui n'est plus la constante figée.
 */
export const LAURA_MODE_SETTINGS_KEY = ['settings', 'laura-mode'] as const

export const lauraModeSettingsApi = {
  get(): Promise<WorkspaceDefaultContextModeResolution> {
    return apiFetch<WorkspaceDefaultContextModeResolution>({ path: '/workspaces/laura-mode' })
  },
  update(patch: UpdateWorkspaceDefaultContextMode): Promise<WorkspaceDefaultContextModeResolution> {
    return apiFetch<WorkspaceDefaultContextModeResolution, UpdateWorkspaceDefaultContextMode>({
      path: '/workspaces/laura-mode',
      method: 'PATCH',
      body: patch,
    })
  },
}
