import { createZodDto } from 'nestjs-zod'
import { classifyContactsSchema } from '@bellum/contracts'

export class ClassifyContactsDto extends createZodDto(classifyContactsSchema) {}
