import { discoverCallListRequestSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'

/** #2545 / #3819 — `POST /contacts/call-list` : les entreprises d'une recherche Découvrir. */
export class DiscoverCallListDto extends createZodDto(discoverCallListRequestSchema) {}
