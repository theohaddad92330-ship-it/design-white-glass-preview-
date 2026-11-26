import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #2445.12 (épopée #2766, lot SRC5 28/09 soir) — `actor` est l'identité de
// l'opérateur backoffice, forwardée par le Dashboard Manager depuis son
// Basic-Auth (même patron que `AdminStopAnalysisDto.actor`) : aucun jeton
// utilisateur ne traverse `InternalSecretGuard`.
export const connectorIncidentActionSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  actor: z.string().max(200).optional(),
})
export class ConnectorIncidentActionDto extends createZodDto(connectorIncidentActionSchema) {}

export const connectorIncidentCommunicationSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  actor: z.string().max(200).optional(),
  /** Le client visé, si cette communication en cible un — jamais deviné. */
  workspaceId: z.string().guid().optional(),
})
export class ConnectorIncidentCommunicationDto extends createZodDto(connectorIncidentCommunicationSchema) {}
