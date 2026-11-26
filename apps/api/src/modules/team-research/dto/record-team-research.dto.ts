import { createZodDto } from 'nestjs-zod'
import { recordTeamResearchSchema } from '@bellum/contracts'

export class RecordTeamResearchDto extends createZodDto(recordTeamResearchSchema) {}
