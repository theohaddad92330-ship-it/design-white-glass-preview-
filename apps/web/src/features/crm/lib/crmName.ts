import { clientToolName } from '@bellum/contracts'
import type { CrmStatus } from '@/features/crm/api'

/**
 * #4526.6 — le nom du CRM branché de l'espace, lu dans le registre des outils du CLIENT
 * (`clientToolName`, GA-44 : jamais de nom écrit en dur ni de nos fournisseurs). `undefined` si aucun n'est
 * branché ou si son nom est inconnu : la puce dit alors « Mon CRM ».
 */
export function crmNameOf(status: CrmStatus | undefined): string | undefined {
  if (!status?.connected || !status.provider) return undefined
  return clientToolName(status.provider) ?? undefined
}
