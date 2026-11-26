import { createZodDto } from 'nestjs-zod'
import { updateProjectAmountSchema } from '@bellum/contracts'

export class UpdateProjectAmountDto extends createZodDto(updateProjectAmountSchema) {}
