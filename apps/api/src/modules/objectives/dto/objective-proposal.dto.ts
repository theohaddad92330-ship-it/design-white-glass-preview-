import { createZodDto } from 'nestjs-zod'
import { createObjectiveProposalSchema, respondObjectiveProposalSchema } from '@bellum/contracts'

export class CreateObjectiveProposalDto extends createZodDto(createObjectiveProposalSchema) {}
export class RespondObjectiveProposalDto extends createZodDto(respondObjectiveProposalSchema) {}
