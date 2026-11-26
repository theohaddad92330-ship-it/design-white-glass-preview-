import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** Fields we map onto a Salesforce Contact. All optional at the edge; the client
 *  fills a LastName fallback (Salesforce requires it). */
export const salesforceExportContactSchema = z
  .object({
    email: z.string().email().optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    company: z.string().trim().min(1).max(200).optional(),
    jobTitle: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    linkedinUrl: z.string().url().max(500).optional(),
  })
  .strict()

export class SalesforceExportContactDto extends createZodDto(salesforceExportContactSchema) {}

/** #4431 — ce que la carte envoie avant « Connecter » : le domaine de l'organisation (facultatif) et la case sandbox.
 *  Le texte est borné ici ; sa règle (hôtes `*.salesforce.com` / `*.force.com`) vit dans `resolveSalesforceLoginUrl`. */
export const salesforceConnectQuerySchema = z
  .object({
    domain: z.string().trim().max(300).optional(),
    sandbox: z.enum(['true', 'false']).optional(),
  })
  .strict()

export class SalesforceConnectQueryDto extends createZodDto(salesforceConnectQuerySchema) {}
