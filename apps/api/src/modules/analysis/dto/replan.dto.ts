import { createZodDto } from 'nestjs-zod'
import { replanSchema } from '@bellum/contracts'

/** Body of POST /analysis/:accountId/replan — optional "change strategy" override. */
export class ReplanDto extends createZodDto(replanSchema) {}
