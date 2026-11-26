import { createDiscoverCandidateFeedbackSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'

export class CreateDiscoverCandidateFeedbackDto extends createZodDto(createDiscoverCandidateFeedbackSchema) {}
