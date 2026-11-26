import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Operator adds a member to a workspace. `owner` is not assignable here — the
// owner is set once at workspace creation. Role defaults to `member`.
export const addMemberSchema = z.object({
  userId: z.string().guid(),
  role: z.enum(['admin', 'member']).optional(),
})
export class AddMemberDto extends createZodDto(addMemberSchema) {}
