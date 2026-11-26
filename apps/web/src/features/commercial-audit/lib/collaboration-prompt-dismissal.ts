const DISMISSED_KEY_PREFIX = 'bellum:audit-collaboration-prompt:dismissed:'

/**
 * #2081.11 — « Permettre de REPORTER » la proposition de collaboration
 * posée en fin d'audit commercial (`AuditCollaborationCard`).
 *
 * Même conviction que #2082.1 (`browser-notification-channel.ts`) : un geste
 * secondaire et dismissible vit dans `localStorage`, PAR NAVIGATEUR — pas une
 * colonne serveur pour un « plus tard ». La clé est en plus scopée par
 * `workspaceId` : reporter la proposition dans un espace ne l'efface jamais
 * dans un autre — **le coût d'accès ne s'agrège jamais entre espaces**
 * (garde GA-43), et ce cloisonnement vaut aussi pour un simple report.
 *
 * Un `localStorage` bloqué (navigation privée, quota) ne doit jamais faire
 * planter l'audit : la lecture dégrade vers « pas encore reportée » et
 * l'écriture avale l'erreur — au pire, la carte reste visible une fois de
 * plus, jamais une exception remontée à l'appelant.
 */
export function isCollaborationPromptDismissed(workspaceId: string): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY_PREFIX + workspaceId) === '1'
  } catch {
    return false
  }
}

export function dismissCollaborationPrompt(workspaceId: string): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY_PREFIX + workspaceId, '1')
  } catch {
    // Mode privé / quota : le report ne survit pas à cet appel, l'audit reste lisible.
  }
}
