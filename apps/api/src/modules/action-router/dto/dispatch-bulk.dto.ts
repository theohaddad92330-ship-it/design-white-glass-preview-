import { createZodDto } from 'nestjs-zod'
import { dispatchBulkRequestSchema } from '@bellum/contracts'

/** Body of `POST /actions/dispatch/bulk` — a bounded list of intents. */
export class DispatchBulkDto extends createZodDto(dispatchBulkRequestSchema) {}
