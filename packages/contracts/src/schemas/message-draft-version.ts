import { z } from 'zod'

/**
 * #3695.4/.6, #3696 (parité démo) — LA TRACE DU BROUILLON, EN BASE.
 *
 * Le fil d'un contact vivait en mémoire de session (`draft-store.ts`, web) :
 * fermer l'onglet du contact l'abandonnait, et aucune démo ne pouvait montrer
 * un brouillon déjà là à l'ouverture du panneau. Une ligne = un tour du fil,
 * dans l'ordre où il est apparu — le modèle approuvé (source, version) ou le
 * style de message appliqué, et la correction manuelle du commercial si elle
 * existe. On ne CORRIGE jamais une ligne : une nouvelle variante ou une
 * nouvelle correction ajoute la sienne (même doctrine que
 * `introduction_authorizations` — une ligne d'audit, pas un état réécrit).
 */
export const MESSAGE_DRAFT_CHANNELS = [
  'email',
  'linkedin',
  'phone',
  'task',
  'voicemail',
  'recommendation',
  // #2370 — les canaux préparés du composer (migration `OutreachChannelsSmsWhatsappAndPrepared1796560200370`).
  'sms',
  'whatsapp',
  'introduction_request',
  'partner_message',
  'follow_up_email',
  'profile_push',
  'linkedin_connection_note',
] as const
export const messageDraftChannelSchema = z.enum(MESSAGE_DRAFT_CHANNELS)
export type MessageDraftChannel = z.infer<typeof messageDraftChannelSchema>

/** Body de `POST /contacts/:id/message-draft-versions`. Ni `workspaceId` ni
 *  `recordedBy` — dérivés du JWT + du workspace actif côté contrôleur. */
export const createMessageDraftVersionSchema = z.object({
  channel: messageDraftChannelSchema,
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(20000),
  // #3696.3 — la correction manuelle du commercial sur CETTE ligne.
  editedSubject: z.string().max(500).optional(),
  editedBody: z.string().max(20000).optional(),
  // #3695.4 — le modèle approuvé inséré tel quel : sa source et sa version.
  usedTemplateSource: z.string().max(200).optional(),
  usedTemplateVersion: z.number().int().positive().optional(),
  // #3695.4 — le style de message résolu et appliqué par le serveur.
  usedStyleId: z.string().guid().optional(),
  // #3695.5 — le texte est identique à la version précédente : jamais annoncé « adapté ».
  unchanged: z.boolean().optional(),
  angle: z.string().max(2000).optional(),
})
export type CreateMessageDraftVersion = z.infer<typeof createMessageDraftVersionSchema>

/** Wire shape (GET .../message-draft-versions) — pas de fuite workspace_id/recorded_by. */
export const messageDraftVersionItemSchema = z.object({
  id: z.string().guid(),
  contactId: z.string().guid(),
  channel: messageDraftChannelSchema,
  subject: z.string().nullable(),
  body: z.string(),
  editedSubject: z.string().nullable(),
  editedBody: z.string().nullable(),
  usedTemplateSource: z.string().nullable(),
  usedTemplateVersion: z.number().nullable(),
  usedStyleId: z.string().nullable(),
  unchanged: z.boolean(),
  angle: z.string().nullable(),
  createdAt: z.string(),
  // Théo C6.N2 — présent sur la lecture d'un fil (`GET …/message-draft-versions`) : la date de validation de CETTE version.
  validatedAt: z.string().nullable().optional(),
})
export type MessageDraftVersionItem = z.infer<typeof messageDraftVersionItemSchema>

/**
 * Théo B C6.N2 / M2.N1 — « Valider le brouillon ». La validation est liée à UNE version : modifier le texte
 * ajoute une version, donc une nouvelle relecture. Valider n'envoie RIEN. Pas de corps ici : l'empreinte seule.
 */
export const messageDraftValidationSchema = z.object({
  versionId: z.string().guid(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  validatedBy: z.string().guid(),
  validatedAt: z.string(),
})
export type MessageDraftValidation = z.infer<typeof messageDraftValidationSchema>

/** Une ligne de « Mes brouillons » : la dernière version d'un fil (contact × canal), validée ou à relire. */
export const myMessageDraftItemSchema = messageDraftVersionItemSchema.extend({
  validatedAt: z.string().nullable(),
  /**
   * Théo B M2.N1 — à QUI s'adresse le brouillon, en clair : le contact, son adresse (jamais masquée), son compte.
   * Une valeur absente reste `null` — ni adresse ni compte inventés — et `versionCount` dit combien de tours le fil compte.
   */
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  accountId: z.string().nullable(),
  accountName: z.string().nullable(),
  versionCount: z.number().int().positive(),
})
export type MyMessageDraftItem = z.infer<typeof myMessageDraftItemSchema>
