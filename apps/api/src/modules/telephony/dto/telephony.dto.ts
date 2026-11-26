import { telephonyCredentialsSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class TelephonyConnectDto extends createZodDto(telephonyCredentialsSchema) {}

/** Fenêtre de lecture des appels. Bornée à 90 jours : au-delà on relit un
 *  journal déjà traité, et chaque appel relu coûte un appel d'API. */
export const telephonyCallsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(90).default(30),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .strict()

export class TelephonyCallsQueryDto extends createZodDto(telephonyCallsQuerySchema) {}

/** Versement des appels au CRM. */
export const telephonyLogQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).strict()

export class TelephonyLogDto extends createZodDto(telephonyLogQuerySchema) {}
