import { createZodDto } from 'nestjs-zod'
import { requestAccountValidationSchema } from '@bellum/contracts'

export class RequestAccountValidationDto extends createZodDto(requestAccountValidationSchema) {}
