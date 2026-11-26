import { createZodDto } from 'nestjs-zod'
import { skipQuestionSchema } from '@bellum/contracts'

export class SkipQuestionDto extends createZodDto(skipQuestionSchema) {}
