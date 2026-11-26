import { createZodDto } from 'nestjs-zod'
import { saveAnswersSchema } from '@bellum/contracts'

export class SaveAnswersDto extends createZodDto(saveAnswersSchema) {}
