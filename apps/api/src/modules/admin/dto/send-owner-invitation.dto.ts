import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Operator clicks « Envoyer » — #2643.1. `actorEmail` vient de la SESSION du
// back-office (jamais deviné) ; voir `avecAuteur` côté `dashboard-manager`.
export const sendOwnerInvitationSchema = z.object({
  actorEmail: z.string().email(),
})
export class SendOwnerInvitationDto extends createZodDto(sendOwnerInvitationSchema) {}
