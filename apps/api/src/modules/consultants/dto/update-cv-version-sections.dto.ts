import { createZodDto } from 'nestjs-zod'
import { updateCvVersionSectionsSchema } from '@bellum/contracts'

/** Body de PATCH /consultants/:id/cv-versions/:versionId — l'action « Modifier » (#2187.42). */
export class UpdateCvVersionSectionsDto extends createZodDto(updateCvVersionSectionsSchema) {}
