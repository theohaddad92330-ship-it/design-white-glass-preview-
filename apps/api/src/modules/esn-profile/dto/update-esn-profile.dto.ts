import { createZodDto } from 'nestjs-zod'
import { saveAnswersSchema } from '@bellum/contracts'

export class UpdateEsnProfileDto extends createZodDto(saveAnswersSchema) {}
