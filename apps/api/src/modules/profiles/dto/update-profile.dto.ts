import { createZodDto } from 'nestjs-zod'
import { updateProfileSchema } from '@bellum/contracts'

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
