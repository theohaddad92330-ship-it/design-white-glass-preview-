import { createZodDto } from 'nestjs-zod'
import { upsertMemberObjectiveSchema } from '@bellum/contracts'

export class UpsertObjectiveDto extends createZodDto(upsertMemberObjectiveSchema) {}
