import { createZodDto } from 'nestjs-zod'
import { createTeamCommentSchema } from '@bellum/contracts'

export class CreateTeamCommentDto extends createZodDto(createTeamCommentSchema) {}
