import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Operator creates a workspace (ESN team) on behalf of an owner. `ownerUserId`
// must be a real profile — the service 404s otherwise.
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  ownerUserId: z.string().guid(),
})
export class CreateWorkspaceDto extends createZodDto(createWorkspaceSchema) {}
