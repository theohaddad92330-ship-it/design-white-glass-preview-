import { z } from 'zod'

/**
 * #3719.4 — « exporté vers MON CRM le … » : l'état d'un export de contact qui
 * SURVIT au rechargement (avant, un `useState` local).
 *
 * Une ligne par (contact, destination). `provider` est un identifiant interne
 * pour distinguer les destinations — il ne s'affiche JAMAIS : l'écran nomme
 * l'espace du CRM de l'utilisateur (`destination_label`, son `accountLabel`),
 * jamais l'éditeur (doctrine : on nomme ce que l'espace a branché, pas ce qui
 * nous sert).
 *
 * `last_action` dit ce que le DERNIER geste a fait (créé / mis à jour) ; un
 * export ponctuel n'est PAS une synchronisation : rien ici ne dit « synchronisé ».
 */
// #4188 — `odoo` : un contact part vers Odoo par la porte commune (#4186) ;
// contrainte SQL élargie AVANT (migration 1796541495729). Miroir de `CRM_PROVIDERS`.
export const CONTACT_CRM_EXPORT_PROVIDERS = ['hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'] as const
export const contactCrmExportProviderSchema = z.enum(CONTACT_CRM_EXPORT_PROVIDERS)

export const CONTACT_CRM_EXPORT_ACTIONS = ['created', 'updated'] as const

export const recordContactCrmExportSchema = z.object({
  crm_record_id: z.string().trim().min(1).max(200),
  created: z.boolean(),
  destination_label: z.string().trim().min(1).max(200).nullish(),
})
export type RecordContactCrmExport = z.infer<typeof recordContactCrmExportSchema>

export const contactCrmExportSchema = z.object({
  provider: contactCrmExportProviderSchema,
  crm_record_id: z.string(),
  last_action: z.enum(CONTACT_CRM_EXPORT_ACTIONS),
  destination_label: z.string().nullable(),
  exported_at: z.string(),
  /**
   * #3719.5 — « ouvrir la fiche du contact dans le CRM de l'utilisateur ».
   * `null` dès que le fournisseur n'expose pas une base par-espace vérifiable
   * (Attio) ou que la connexion a disparu depuis l'export — jamais un lien
   * deviné (doctrine : un contrat d'API non vérifiable ne se devine pas).
   */
  record_url: z.string().nullable(),
})
export type ContactCrmExport = z.infer<typeof contactCrmExportSchema>

export const contactCrmExportsSchema = z.object({
  contact_id: z.string().guid(),
  items: z.array(contactCrmExportSchema),
})
export type ContactCrmExports = z.infer<typeof contactCrmExportsSchema>
