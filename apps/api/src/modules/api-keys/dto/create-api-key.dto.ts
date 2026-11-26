import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PUBLIC_API_SCOPES } from '../api-key.scopes'

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(64),
  // Default = every read scope: the common case is "one key for my tooling".
  scopes: z
    .array(z.enum(PUBLIC_API_SCOPES))
    .min(1)
    .default([...PUBLIC_API_SCOPES]),
})

export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
