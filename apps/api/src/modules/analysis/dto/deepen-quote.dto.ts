import { createZodDto } from 'nestjs-zod'
import { deepenQuoteRequestSchema } from '@bellum/contracts'

/** #2452 — body of POST /analysis/deepen/quote: the (account, axis) pairs an
 *  approfondissement from /chat would replay. Read-only: nothing is launched. */
export class DeepenQuoteDto extends createZodDto(deepenQuoteRequestSchema) {}
