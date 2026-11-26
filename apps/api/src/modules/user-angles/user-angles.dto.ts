import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const TITLE_MAX = 120
const CONTENT_MAX = 2000

const createUserAngleSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  content: z.string().trim().min(1).max(CONTENT_MAX),
})

const updateUserAngleSchema = createUserAngleSchema.partial()

export class CreateUserAngleDto extends createZodDto(createUserAngleSchema) {}
export class UpdateUserAngleDto extends createZodDto(updateUserAngleSchema) {}
