import { z } from 'zod'
import { CONTACT_CRM_EXPORT_ACTIONS } from './contact-crm-exports.js'
import { crmProviderSchema } from './crm-adapter.js'

/**
 * #4188 — « ce compte, je l'envoie sur mon CRM ; ces contacts, je les envoie ».
 *
 * Unitaire (un compte et les contacts cochés) OU en lot (plusieurs comptes,
 * plusieurs contacts) : la MÊME route, en deux temps — une prévisualisation
 * (créés / mis à jour / déjà présents / refusés), puis la validation. Chaque
 * écriture passe par la porte commune (#4186) : un clic EST la décision,
 * chaque élément garde sa propre demande, son propre résultat.
 *
 * `provider` identifie l'OUTIL branché par l'espace ; l'écran le nomme
 * (`CRM_TOOL_NAMES`) avec `destination` (l'espace CRM de l'utilisateur). La
 * doctrine interdit de nommer NOS fournisseurs, pas l'outil que le client a
 * lui-même branché (décision Louis 16/10/2026).
 *
 * Plusieurs CRM : la fenêtre liste les CRM branchés (`crmPushTargetsSchema`), la
 * personne en coche un ou plusieurs, et chaque CRM coché reçoit SA prévisualisation
 * et SON envoi (`provider` dans la demande), par la même porte.
 */

/** Les CRM vers lesquels un compte s'envoie. Miroir LITTÉRAL de `CRM_PROVIDERS`
 *  (la garde des contraintes SQL lit ce littéral) ; un test vérifie l'égalité. */
export const ACCOUNT_CRM_EXPORT_PROVIDERS = ['hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'] as const

/** Un compte déjà envoyé : la référence externe qui empêche un doublon. */
export const accountCrmExportSchema = z.object({
  provider: z.enum(ACCOUNT_CRM_EXPORT_PROVIDERS),
  crm_record_id: z.string(),
  last_action: z.enum(CONTACT_CRM_EXPORT_ACTIONS),
  destination_label: z.string().nullable(),
  exported_at: z.string(),
  /** La fiche société dans le CRM ; `null` quand l'URL n'est pas vérifiable (jamais devinée). */
  record_url: z.string().nullable(),
})
export type AccountCrmExport = z.infer<typeof accountCrmExportSchema>

export const accountCrmExportsResponseSchema = z.object({ items: z.array(accountCrmExportSchema) })
export type AccountCrmExportsResponse = z.infer<typeof accountCrmExportsResponseSchema>

/** Bornes d'un lot : au-delà, l'envoi se découpe — une file de 1 000 demandes ne se relit pas. */
const MAX_PUSH_ACCOUNTS = 50
const MAX_PUSH_CONTACTS = 200

export const crmPushRequestSchema = z
  .object({
    /** Le CRM visé ; absent = le premier CRM branché (ordre du contrat). */
    provider: crmProviderSchema.optional(),
    accountIds: z.array(z.string().guid()).max(MAX_PUSH_ACCOUNTS).default([]),
    contactIds: z.array(z.string().guid()).max(MAX_PUSH_CONTACTS).default([]),
    /** Envoyer AUSSI tous les contacts des comptes choisis (le lot depuis une liste de comptes). */
    withAccountContacts: z.boolean().default(false),
  })
  .strict()
  .refine(v => v.accountIds.length + v.contactIds.length > 0, { message: 'Choisis au moins un compte ou un contact.' })
export type CrmPushRequest = z.infer<typeof crmPushRequestSchema>

/** Ce que la prévisualisation annonce pour chaque élément. */
export const CRM_PUSH_VERDICTS = ['create', 'update', 'already_present', 'refused'] as const
/** Ce qui s'est réellement passé. `unknown` = parti sans réponse (à vérifier dans le CRM, jamais à relancer). */
export const CRM_PUSH_OUTCOMES = [
  'created',
  'updated',
  'already_present',
  'pending',
  'refused',
  'failed',
  'unknown',
] as const

const crmPushItemBase = z.object({
  entity: z.enum(['account', 'contact']),
  id: z.string(),
  label: z.string(),
  /** Pourquoi un élément est refusé ou a échoué ; `null` sinon. */
  reason: z.string().nullable(),
  crmRecordId: z.string().nullable(),
  recordUrl: z.string().nullable(),
})

/**
 * #4290.1 (#4184.3) — un CHAMP qui sera écrit dans le CRM, avec sa valeur. Seuls les champs RENSEIGNÉS
 * figurent (« on n'affiche pas ce qu'on n'a pas ») ; un élément refusé n'en a aucun. Ce que le CRM contient
 * déjà côté fiche n'est pas relu avant l'envoi : l'écran le dit, il ne le devine pas.
 */
export const CRM_PUSH_FIELDS = [
  'name',
  'domain',
  'email',
  'firstName',
  'lastName',
  'company',
  'jobTitle',
  'phone',
  'linkedinUrl',
] as const
export const crmPushFieldSchema = z.object({ field: z.enum(CRM_PUSH_FIELDS), value: z.string() })

export const crmPushPreviewSchema = z.object({
  provider: crmProviderSchema,
  destination: z.string().nullable(),
  items: z.array(
    crmPushItemBase.extend({
      verdict: z.enum(CRM_PUSH_VERDICTS),
      /** Les champs qui partiraient, valeur par champ ; vide = rien n'est écrit pour cet élément. */
      fields: z.array(crmPushFieldSchema).default([]),
    }),
  ),
})
export type CrmPushPreview = z.infer<typeof crmPushPreviewSchema>

export const crmPushResultSchema = z.object({
  provider: crmProviderSchema,
  destination: z.string().nullable(),
  /** Le lot de demandes d'écriture (`null` = un seul élément, jamais un lot inventé). */
  batchId: z.string().nullable(),
  items: z.array(crmPushItemBase.extend({ outcome: z.enum(CRM_PUSH_OUTCOMES) })),
})
export type CrmPushResult = z.infer<typeof crmPushResultSchema>

/**
 * Un CRM branché, tel que la fenêtre d'envoi le liste. `primary` = celui que
 * l'aperçu utilisait seul jusqu'ici (le premier branché) : le seul coché par défaut.
 * `writable: false` = branché mais sans droit d'écriture — listé, non cochable,
 * avec sa raison (`readOnlyReason`).
 */
export const crmPushTargetSchema = z.object({
  provider: crmProviderSchema,
  destination: z.string().nullable(),
  primary: z.boolean(),
  writable: z.boolean(),
  readOnlyReason: z.string().nullable(),
})
export type CrmPushTarget = z.infer<typeof crmPushTargetSchema>

export const crmPushTargetsSchema = z.object({ targets: z.array(crmPushTargetSchema) })
export type CrmPushTargets = z.infer<typeof crmPushTargetsSchema>
