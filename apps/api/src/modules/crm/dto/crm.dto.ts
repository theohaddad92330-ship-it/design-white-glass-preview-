import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  actionDispatchIdempotencyKeySchema,
  assignApprovalRequestSchema,
  crmProviderSchema,
  crmPushRequestSchema,
  snoozeApprovalRequestSchema,
} from '@bellum/contracts'

/**
 * #2864 — reste du lot précédent : CONFIER une écriture CRM en attente à un
 * collègue. Même contrat que `assignApprovalRequestSchema` (Action OS,
 * `POST /action-os/approvals/:id/assign`) — GA-26, un réglage vit à un seul
 * endroit — la forme (`{ assigneeId }`) ne change pas d'une file à l'autre.
 */
export class AssignCrmWriteRequestDto extends createZodDto(assignApprovalRequestSchema) {}

/**
 * #2856 — reste du lot précédent : REPORTER une écriture CRM en attente.
 * Même contrat que `snoozeApprovalRequestSchema` (Action OS) — GA-26.
 */
export class SnoozeCrmWriteRequestDto extends createZodDto(snoozeApprovalRequestSchema) {}

/**
 * Export a contact into the connected CRM. At least one identifying field is
 * required (HubSpot rejects a contact with no properties). Extra shape is kept
 * minimal for the beta — email + name + company + role cover the ESN use case.
 */
const exportContactFields = z.object({
  email: z.string().email().optional(),
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  company: z.string().trim().min(1).max(200).optional(),
  jobTitle: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  linkedinUrl: z.string().url().max(500).optional(),
  /**
   * #1959.4 / #1959.6 — le chat appelle cet endpoint EN DIRECT
   * (`crmApi.exportContact` depuis `PendingActions.tsx`), sans passer par le
   * routeur d'actions : un double clic ou deux onglets créaient deux fiches
   * dans le CRM connecté. Optionnelle : absente, la porte `OutboundWriteService`
   * se comporte exactement comme avant ce champ (aucune clé, aucun dédup).
   */
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
const HAS_IDENTITY = {
  message: 'Provide at least an email, or a first and last name',
}
const hasIdentity = (v: { email?: string; firstName?: string; lastName?: string }): boolean =>
  Boolean(v.email || (v.firstName && v.lastName))
export const exportContactSchema = exportContactFields.refine(hasIdentity, HAS_IDENTITY)

export class ExportContactDto extends createZodDto(exportContactSchema) {}

/**
 * #4186.1 — `POST /crm/push/contact` : la route UNIQUE d'export de contact
 * vers un CRM branché autre que HubSpot, PAR LA PORTE. Remplace
 * `POST /salesforce|pipedrive|attio|odoo/export`, qui écrivaient en direct.
 */
const pushContactSchema = exportContactFields.extend({ provider: crmProviderSchema }).refine(hasIdentity, HAS_IDENTITY)
export class PushContactDto extends createZodDto(pushContactSchema) {}

/**
 * Query for importing the rep's CRM contacts. `limit` is coerced from the query
 * string (HubSpot caps a page at 100); `after` is the opaque paging cursor
 * returned by the previous page.
 */
export const listContactsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  after: z.string().trim().min(1).max(500).optional(),
})

export class ListContactsQueryDto extends createZodDto(listContactsQuerySchema) {}

/**
 * Log an activity onto a CRM contact's timeline. `note` is the free-text body
 * (e.g. "email envoyé depuis Bellum").
 */
export const logActivitySchema = z.object({
  note: z.string().trim().min(1).max(5000),
})

export class LogActivityDto extends createZodDto(logActivitySchema) {}

/**
 * Query for the CRM presence read-back (« as-tu déjà un contact chez ce
 * groupe ? »). `account` is the company name; `domain` sharpens the match;
 * `siren` is accepted for future FR-aware CRMs (unused by HubSpot/Salesforce).
 * At least a name or a domain is required — there is nothing to match otherwise.
 */
export const presenceQuerySchema = z
  .object({
    account: z.string().trim().min(2).max(200).optional(),
    domain: z.string().trim().min(3).max(200).optional(),
    siren: z.string().trim().min(9).max(14).optional(),
  })
  .refine(v => Boolean(v.account || v.domain), { message: 'Provide at least an account name or a domain' })

export class PresenceQueryDto extends createZodDto(presenceQuerySchema) {}

/**
 * Tâche de relance dans le CRM. L'échéance est REQUISE : une tâche sans date ne
 * remonte dans aucune vue et ne sert donc à personne.
 */
export const crmCreateTaskSchema = z
  .object({
    contactId: z.string().trim().min(1).max(100).optional(),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().max(4000).optional(),
    dueAt: z.string().datetime({ offset: true }),
  })
  .strict()

export class CrmCreateTaskDto extends createZodDto(crmCreateTaskSchema) {}

/**
 * Journal d'une réunion tenue. `externalId` porte l'identifiant de l'évènement
 * d'agenda : c'est la clé qui permet à l'appelant de ne pas journaliser deux
 * fois le même rendez-vous.
 */
export const crmLogMeetingSchema = z
  .object({
    contactId: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(300),
    body: z.string().trim().max(8000).optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    externalId: z.string().trim().min(1).max(300).optional(),
  })
  .strict()

export class CrmLogMeetingDto extends createZodDto(crmLogMeetingSchema) {}

/** Contacts sans activité depuis `days` jours. */
export const crmStaleContactsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(730).default(30),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()

export class CrmStaleContactsQueryDto extends createZodDto(crmStaleContactsQuerySchema) {}

// ---- Profondeur CRM (arbitrages Louis du 03/08) -----------------------------

/** Rapport de pipeline. `refresh` force la relecture ; sans lui, le cache d'un
 *  jour suffit — la question « où en est mon trimestre » ne change pas d'heure
 *  en heure. */
export const crmPipelineQuerySchema = z
  .object({
    period: z.enum(['month', 'quarter', 'year']).default('quarter'),
    refresh: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform(value => value === true || value === 'true')
      .default(false),
  })
  .strict()

export class CrmPipelineQueryDto extends createZodDto(crmPipelineQuerySchema) {}

/**
 * Création d'une liste statique. Les membres sont optionnels : « crée ma liste
 * des prospects Q4 » est une demande valable avant de savoir qui y mettre.
 */
export const crmCreateListSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contactIds: z.array(z.string().trim().min(1).max(100)).max(500).optional(),
  })
  .strict()

export class CrmCreateListDto extends createZodDto(crmCreateListSchema) {}

/**
 * Inscription dans une séquence du CRM.
 *
 * `senderEmail` est REQUIS et n'est pas devinable : le fournisseur exige une
 * boîte d'expédition connectée chez lui, et choisir à la place de l'utilisateur
 * ferait partir des e-mails sous une identité qu'il n'a pas choisie.
 */
export const crmEnrollSchema = z
  .object({
    sequenceId: z.string().trim().min(1).max(100),
    contactIds: z.array(z.string().trim().min(1).max(100)).min(1).max(200),
    senderEmail: z.string().email(),
  })
  .strict()

export class CrmEnrollDto extends createZodDto(crmEnrollSchema) {}

/** Import en masse de contacts. L'e-mail est requis : sans clé d'appariement,
 *  chaque import recréerait les mêmes personnes. */
export const crmImportContactsSchema = z
  .object({
    contacts: z
      .array(
        z
          .object({
            email: z.string().email(),
            firstName: z.string().trim().max(120).optional(),
            lastName: z.string().trim().max(120).optional(),
            company: z.string().trim().max(200).optional(),
            jobTitle: z.string().trim().max(200).optional(),
            phone: z.string().trim().max(40).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()

export class CrmImportContactsDto extends createZodDto(crmImportContactsSchema) {}

/** Création d'une société dans le CRM. */
export const crmCreateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    domain: z.string().trim().min(3).max(200).optional(),
    industry: z.string().trim().max(200).optional(),
    city: z.string().trim().max(200).optional(),
  })
  .strict()

export class CrmCreateCompanyDto extends createZodDto(crmCreateCompanySchema) {}

/** Classement des leads par engagement. */
export const crmLeadScoreQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }).strict()

export class CrmLeadScoreQueryDto extends createZodDto(crmLeadScoreQuerySchema) {}

/** #4188 — envoyer des comptes et/ou des contacts vers le CRM branché (prévisualisation, puis envoi). */
export class CrmPushDto extends createZodDto(crmPushRequestSchema) {}
