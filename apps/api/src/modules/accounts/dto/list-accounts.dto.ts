import { createZodDto } from 'nestjs-zod'
import { accountListQuerySchema } from '@bellum/contracts'

export class ListAccountsDto extends createZodDto(accountListQuerySchema) {}
