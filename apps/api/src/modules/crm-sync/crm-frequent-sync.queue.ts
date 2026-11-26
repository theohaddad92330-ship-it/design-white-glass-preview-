import type { CrmProvider } from '@bellum/contracts'

/**
 * SYNC-C — la file de la synchro fréquente des CRM : un job RÉPÉTABLE par (espace, fournisseur) branché, plus les
 * passages CIBLÉS déclenchés par un webhook entrant.
 */
export const CRM_FREQUENT_SYNC_QUEUE = 'crm-frequent-sync'

export type CrmFrequentSyncJobData = {
  workspaceId: string
  /** Qui a branché ce CRM : les lectures passent par son jeton (l'espace partage la connexion). */
  userId: string
  provider: CrmProvider
  /** `schedule` : le passage répété ; `webhook` : une synchro ciblée à la demande du CRM. */
  trigger: 'schedule' | 'webhook'
}

/** L'identifiant du planificateur répété d'un couple (espace, fournisseur) : un seul par couple. */
export function crmFrequentSyncSchedulerId(workspaceId: string, provider: string): string {
  return `crm-frequent:${workspaceId}:${provider}`
}

/** Fenêtre de dédoublonnage d'un passage ciblé par webhook : une rafale d'événements = un seul passage. */
export const CRM_WEBHOOK_DEDUP_MS = 30_000
