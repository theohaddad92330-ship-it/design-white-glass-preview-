import { createZodDto } from 'nestjs-zod'
import { assignAccountBusinessUnitSchema } from '@bellum/contracts'

export class AssignAccountBusinessUnitDto extends createZodDto(assignAccountBusinessUnitSchema) {}
