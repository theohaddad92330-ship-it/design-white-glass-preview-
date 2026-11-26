import { createZodDto } from 'nestjs-zod'
import { createMessageDraftVersionSchema } from '@bellum/contracts'

// Body de POST /contacts/:id/message-draft-versions — schéma partagé dans
// @bellum/contracts. Ni workspaceId ni recordedBy : le contrôleur les dérive
// du JWT + du workspace actif.
export class CreateMessageDraftVersionDto extends createZodDto(createMessageDraftVersionSchema) {}
