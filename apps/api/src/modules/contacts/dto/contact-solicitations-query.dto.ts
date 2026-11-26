import { createZodDto } from 'nestjs-zod'
import { contactSolicitationsQuerySchema } from '@bellum/contracts'

export class ContactSolicitationsQueryDto extends createZodDto(contactSolicitationsQuerySchema) {}
