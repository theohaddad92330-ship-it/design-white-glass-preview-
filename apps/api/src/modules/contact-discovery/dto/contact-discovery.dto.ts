import { createZodDto } from 'nestjs-zod'
import { contactDiscoveryQuoteRequestSchema, contactDiscoveryRunRequestSchema } from '@bellum/contracts'

/** #2809 — body of POST /contacts/discover/quote: the accounts a fresh
 *  cross-account discovery would target. Read-only: nothing is launched. */
export class ContactDiscoveryQuoteDto extends createZodDto(contactDiscoveryQuoteRequestSchema) {}

/** #2809 — body of POST /contacts/discover/:accountId. */
export class ContactDiscoveryRunDto extends createZodDto(contactDiscoveryRunRequestSchema) {}
