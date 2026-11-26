import { createZodDto } from 'nestjs-zod'
import { setCommitteeEntryLevelSchema } from '@bellum/contracts'

export class SetCommitteeEntryLevelDto extends createZodDto(setCommitteeEntryLevelSchema) {}
