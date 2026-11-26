import { createZodDto } from 'nestjs-zod'
import { dismissInferredPlacedRoleSchema } from '@bellum/contracts'

export class DismissInferredPlacedRoleDto extends createZodDto(dismissInferredPlacedRoleSchema) {}
