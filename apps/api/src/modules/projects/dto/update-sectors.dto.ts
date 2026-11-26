import { createZodDto } from 'nestjs-zod'
import { updateProjectSectorsSchema } from '@bellum/contracts'

export class UpdateProjectSectorsDto extends createZodDto(updateProjectSectorsSchema) {}
