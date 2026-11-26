import {
  linkMailThreadAccountRequestSchema,
  linkMailThreadContactRequestSchema,
  mailBatchRequestSchema,
  mailDraftRequestSchema,
  mailReplyDraftRequestSchema,
  mailSearchRequestSchema,
  outOfOfficeRequestSchema,
  setMailThreadMarkRequestSchema,
  setMailThreadPriorityRequestSchema,
  snoozeMailThreadRequestSchema,
  updateSignatureSchema,
} from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Les DTO de la messagerie réutilisent TELS QUELS les schémas de
 * `@bellum/contracts`. Redéclarer les mêmes bornes ici créerait deux vérités
 * — celle que l'API valide et celle que le client croit — qui divergeraient au
 * premier ajout de champ.
 */

/** Recherche par intention métier. Les paramètres arrivent en query string. */
export const mailSearchQuerySchema = mailSearchRequestSchema.extend({
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
  silenceDays: z.coerce.number().int().min(1).max(180).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export class MailSearchQueryDto extends createZodDto(mailSearchQuerySchema) {}

export class MailDraftDto extends createZodDto(mailDraftRequestSchema) {}

/** #4405.1 — body of `POST /mailbox/reply-draft`. */
export class MailReplyDraftDto extends createZodDto(mailReplyDraftRequestSchema) {}

export class OutOfOfficeDto extends createZodDto(outOfOfficeRequestSchema) {}
export class UpdateSignatureDto extends createZodDto(updateSignatureSchema) {}

/** Lister les pièces jointes d'un message identifié. */
export const mailAttachmentsQuerySchema = z.object({ messageId: z.string().trim().min(1).max(400) }).strict()

export class MailAttachmentsQueryDto extends createZodDto(mailAttachmentsQuerySchema) {}

export class MailBatchDto extends createZodDto(mailBatchRequestSchema) {}

/** #2104.7 / #2104.8 — marquer traité, ou signaler non pertinent. */
export class SetMailThreadMarkDto extends createZodDto(setMailThreadMarkRequestSchema) {}

/** #2104.6 — rattacher un fil à un compte à la main. */
export class LinkMailThreadAccountDto extends createZodDto(linkMailThreadAccountRequestSchema) {}

/** Théo B M1.N2 / M1.N3 / M1.N6 — reporter, prioriser, rattacher à un contact. */
export class SnoozeMailThreadDto extends createZodDto(snoozeMailThreadRequestSchema) {}
export class SetMailThreadPriorityDto extends createZodDto(setMailThreadPriorityRequestSchema) {}
export class LinkMailThreadContactDto extends createZodDto(linkMailThreadContactRequestSchema) {}
