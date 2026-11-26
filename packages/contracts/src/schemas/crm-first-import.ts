import { z } from 'zod'
import { CRM_PROVIDERS } from './crm-adapter.js'

/**
 * SYNC-B — la PREMIÈRE REPRISE d'un CRM, lancée seule au branchement. Un état par (espace, CRM), lisible
 * par l'écran : progression PAR OBJET, résumé chiffré à la fin, erreurs NOMMÉES par objet.
 *
 * `count` absent (`null`) = non mesuré — jamais « 0 » (gardes GA-18 / GA-19).
 */
export const CRM_FIRST_IMPORT_OBJECTS = ['accounts', 'contacts', 'deals', 'activities', 'owners'] as const
export type CrmFirstImportObject = (typeof CRM_FIRST_IMPORT_OBJECTS)[number]

export const CRM_FIRST_IMPORT_STATES = ['queued', 'running', 'done', 'failed'] as const

export const crmFirstImportObjectSchema = z.object({
  object: z.enum(CRM_FIRST_IMPORT_OBJECTS),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  /** Fiches reprises (créées + reconnues). `null` tant que non mesuré. */
  count: z.number().int().nonnegative().nullable(),
  /**
   * #4290.19 — rejouée sur une base déjà écrite, la reprise ne recrée rien : elle dit ce qu'elle a CRÉÉ et ce
   * qu'elle a RECONNU (déjà dans Bellum, mis à jour ou inchangé). Absents d'une reprise d'avant le compteur et des
   * objets du miroir (qui ne distingue pas) — jamais un 0 inventé.
   */
  created: z.number().int().nonnegative().nullable().optional(),
  recognized: z.number().int().nonnegative().nullable().optional(),
  /** Fiches modifiées des deux côtés : la correction humaine est gardée, l'écart est compté. */
  conflicts: z.number().int().nonnegative().nullable(),
  /** La lecture a été coupée par une borne : le chiffre est un minimum, l'écran le DIT. */
  truncated: z.boolean(),
  error: z.string().nullable(),
})
export type CrmFirstImportObjectState = z.infer<typeof crmFirstImportObjectSchema>

export const crmFirstImportStateSchema = z.object({
  provider: z.enum(CRM_PROVIDERS),
  state: z.enum(CRM_FIRST_IMPORT_STATES),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  /** Message d'ensemble en cas d'échec (délai dépassé, jeton refusé…). */
  message: z.string().nullable(),
  /** Le jeton est refusé : l'écran dit « reconnecte <CRM> » plutôt qu'un échec muet. */
  reconnectNeeded: z.boolean(),
  objects: z.array(crmFirstImportObjectSchema),
  /** Données fictives de la salle de démonstration. */
  demo: z.boolean().optional(),
})
export type CrmFirstImportState = z.infer<typeof crmFirstImportStateSchema>

export const crmFirstImportResponseSchema = z.object({ items: z.array(crmFirstImportStateSchema) })
export type CrmFirstImportResponse = z.infer<typeof crmFirstImportResponseSchema>
