import { createZodDto } from 'nestjs-zod'
import { signalStateRequestSchema, watchRequestSchema, watchStateRequestSchema } from '@bellum/contracts'

export class SignalStateDto extends createZodDto(signalStateRequestSchema) {}
export class WatchDto extends createZodDto(watchRequestSchema) {}
export class WatchStateDto extends createZodDto(watchStateRequestSchema) {}
