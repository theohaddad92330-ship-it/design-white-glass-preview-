import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Shared pagination + search query for the users / workspaces list endpoints.
// `limit` is only lower-bounded here (>= 1); the hard cap of 100 is CLAMPED in
// the service (a caller asking for 500 gets 100, not a 400) per the contract.
// `z.coerce` turns the string query params into numbers.
export const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
})
export class ListQueryDto extends createZodDto(listQuerySchema) {}
