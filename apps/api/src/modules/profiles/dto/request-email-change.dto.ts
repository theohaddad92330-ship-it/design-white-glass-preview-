import { createZodDto } from 'nestjs-zod'
import { requestEmailChangeSchema } from '@bellum/contracts'

export class RequestEmailChangeDto extends createZodDto(requestEmailChangeSchema) {}
