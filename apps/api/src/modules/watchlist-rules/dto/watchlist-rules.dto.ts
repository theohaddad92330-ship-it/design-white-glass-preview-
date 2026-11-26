import { createZodDto } from 'nestjs-zod'
import { createWatchlistRuleSchema } from '@bellum/contracts'

/** POST /watchlist/rules — `{ kind, value }`, validé + trimé par le contrat zod. */
export class CreateWatchlistRuleDto extends createZodDto(createWatchlistRuleSchema) {}
