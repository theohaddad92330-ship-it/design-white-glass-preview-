import { createZodDto } from 'nestjs-zod'
import { trackActionSchema } from '@bellum/contracts'

export class TrackActionDto extends createZodDto(trackActionSchema) {}
