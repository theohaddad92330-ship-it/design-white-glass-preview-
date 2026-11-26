import { adminDocsCredentialsSchema, adminDocsProviderSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class AdminDocsConnectDto extends createZodDto(adminDocsCredentialsSchema) {}

export const adminDocsProviderParamSchema = z.object({ provider: adminDocsProviderSchema }).strict()

export class AdminDocsProviderParamDto extends createZodDto(adminDocsProviderParamSchema) {}

/** L'envoi à signature porte sur une demande DÉJÀ préparée chez le fournisseur :
 *  Bellum ne compose pas un document à valeur légale. */
export const adminDocsSendSchema = z
  .object({
    signatureRequestId: z.string().trim().min(1).max(200),
    // #4295.27 — la proposition à laquelle la demande se rattache : c'est ce que « Relire le statut » relira.
    projectId: z.string().guid().optional(),
  })
  .strict()

export class AdminDocsSendDto extends createZodDto(adminDocsSendSchema) {}
