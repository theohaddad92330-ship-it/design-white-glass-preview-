import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  approvedTemplateChannelSchema,
  approvedTemplateScenarioIdSchema,
  outreachPersonaSchema,
} from '@bellum/contracts'

const listApprovedTemplateCandidatesQuerySchema = z.object({
  channel: approvedTemplateChannelSchema,
  scenario: approvedTemplateScenarioIdSchema,
  /** #2123.61-.68 — réutilise le persona déjà choisi dans `ComposerParameters` quand il est fourni. */
  persona: outreachPersonaSchema.optional(),
})

/** Query de `GET /outreach-templates/:contactId`. */
export class ListApprovedTemplateCandidatesDto extends createZodDto(listApprovedTemplateCandidatesQuerySchema) {}
