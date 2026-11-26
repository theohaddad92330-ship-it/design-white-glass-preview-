import { createZodDto } from 'nestjs-zod'
import { setTeamThreadResolutionSchema } from '@bellum/contracts'

export class SetTeamThreadResolutionDto extends createZodDto(setTeamThreadResolutionSchema) {}
