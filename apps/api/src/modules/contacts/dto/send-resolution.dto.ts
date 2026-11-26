import { createZodDto } from 'nestjs-zod'
import { sendResolutionSchema } from '@bellum/contracts'

export class SendResolutionDto extends createZodDto(sendResolutionSchema) {}
