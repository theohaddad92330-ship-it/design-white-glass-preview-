import { createZodDto } from 'nestjs-zod'
import { archiveConsultantsSchema } from '@bellum/contracts'

// #2662.2 — le geste d'archivage EN LOT, validé comme la version unitaire.
export class ArchiveConsultantsDto extends createZodDto(archiveConsultantsSchema) {}
