import { createZodDto } from 'nestjs-zod'
import { updateProjectScopeSchema } from '@bellum/contracts'

export class UpdateProjectScopeDto extends createZodDto(updateProjectScopeSchema) {}
