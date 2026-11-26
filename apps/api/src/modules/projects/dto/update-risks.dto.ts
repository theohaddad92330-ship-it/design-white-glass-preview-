import { createZodDto } from 'nestjs-zod'
import { updateProjectRisksSchema } from '@bellum/contracts'

export class UpdateProjectRisksDto extends createZodDto(updateProjectRisksSchema) {}
