import { createDiscoverCandidateNoteSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'

export class CreateDiscoverCandidateNoteDto extends createZodDto(createDiscoverCandidateNoteSchema) {}
