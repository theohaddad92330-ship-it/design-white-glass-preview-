import { createZodDto } from 'nestjs-zod'
import { setBestReferenceSchema } from '@bellum/contracts'

export class SetBestReferenceDto extends createZodDto(setBestReferenceSchema) {}
