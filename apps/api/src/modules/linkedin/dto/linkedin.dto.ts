import { linkedinInteractionKindSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { LINKEDIN_DAILY_SEND_LIMIT } from '../linkedin-mandate'

/** Une interaction déclarée par le commercial. La date est optionnelle : « je
 *  viens de l'ajouter » est le cas courant, et exiger une saisie de date à
 *  chaque geste garantit que personne ne journalise rien. */
export const recordInteractionSchema = z
  .object({
    contactId: z.string().guid(),
    kind: linkedinInteractionKindSchema,
    occurredAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict()

export class RecordInteractionDto extends createZodDto(recordInteractionSchema) {}

/** Les connexions acceptées restées sans réponse. Trois jours par défaut, comme
 *  le rapport le demande. */
export const followUpQuerySchema = z.object({ afterDays: z.coerce.number().int().min(1).max(90).default(3) }).strict()

export class FollowUpQueryDto extends createZodDto(followUpQuerySchema) {}

/** Contexte des sujets de publication. Tout est optionnel — un contexte mince
 *  doit produire moins de sujets, jamais des sujets inventés. */
export const postIdeasSchema = z.object({ objective: z.string().trim().max(500).optional() }).strict()

export class PostIdeasDto extends createZodDto(postIdeasSchema) {}

/** Le mandat d'envoi (#4737) : une période et une borne de volume, rien d'autre. */
export const grantMandateSchema = z
  .object({
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }),
    dailyLimit: z.number().int().min(1).max(LINKEDIN_DAILY_SEND_LIMIT).default(LINKEDIN_DAILY_SEND_LIMIT),
  })
  .strict()

export class GrantMandateDto extends createZodDto(grantMandateSchema) {}

/** Le geste d'envoi. Le corps n'est jamais renvoyé dans la réponse. */
export const sendMessageSchema = z
  .object({ contactId: z.string().guid(), body: z.string().trim().min(1).max(8000) })
  .strict()

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
