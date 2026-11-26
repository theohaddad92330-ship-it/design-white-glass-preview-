import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Operator renames a workspace.
export const renameWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
})
export class RenameWorkspaceDto extends createZodDto(renameWorkspaceSchema) {}
