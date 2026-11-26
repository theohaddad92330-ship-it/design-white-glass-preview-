import { lemlistCredentialsSchema, lemlistPushInputSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'

export class LemlistConnectDto extends createZodDto(lemlistCredentialsSchema) {}

export class LemlistPushDto extends createZodDto(lemlistPushInputSchema) {}
