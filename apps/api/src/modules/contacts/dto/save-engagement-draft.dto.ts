import { createZodDto } from 'nestjs-zod'
import { engagementDraftSnapshotSchema } from '@bellum/contracts'

export class SaveEngagementDraftDto extends createZodDto(engagementDraftSnapshotSchema) {}
