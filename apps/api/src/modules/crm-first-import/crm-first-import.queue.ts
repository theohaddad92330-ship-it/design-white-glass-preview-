import type { JobsOptions } from 'bullmq'
import type { CrmProvider } from '@bellum/contracts'

/**
 * SYNC-B — la première reprise d'un CRM, UN job par (espace, CRM). L'état vit dans le job (progression +
 * valeur de retour), lu par `GET /crm/import/first-import` : aucune table neuve.
 */
export const CRM_FIRST_IMPORT_QUEUE = 'crm-first-import'

export type CrmFirstImportJobData = {
  /** Le membre qui a branché : c'est son espace actif et son jeton que la reprise relit. */
  userId: string
  workspaceId: string
  provider: CrmProvider
}

/** Le même couple ne s'empile jamais : un second branchement pendant qu'un job tourne ne double rien. */
export function crmFirstImportJobId(workspaceId: string, provider: CrmProvider): string {
  return `first-import_${workspaceId}_${provider}`
}

/** Borne dure d'une reprise : au-delà, l'état passe à `failed` avec son message — jamais un spinner éternel. */
export const CRM_FIRST_IMPORT_DEADLINE_MS = 30 * 60 * 1000

export const CRM_FIRST_IMPORT_JOB_OPTIONS: JobsOptions = {
  // Les échecs par objet sont NOMMÉS dans l'état, pas rejoués à l'aveugle : une seule tentative.
  attempts: 1,
  removeOnComplete: { age: 604_800, count: 200 },
  removeOnFail: { age: 604_800 },
}

/** CRM-SYNC-D.1 — recul du rattrapage : une reprise terminée (échec compris) ne se relance pas avant une heure. */
export const CRM_FIRST_IMPORT_RETRY_MS = 60 * 60 * 1000
