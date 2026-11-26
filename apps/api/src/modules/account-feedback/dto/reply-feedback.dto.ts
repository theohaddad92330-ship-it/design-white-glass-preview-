import { createZodDto } from 'nestjs-zod'
import { createReplyFeedbackSchema } from '@bellum/contracts'

// Body de POST /reply-feedback (#1919) — schéma partagé dans @bellum/contracts :
// vocabulaires fermés, champs libres bornés, empreinte au lieu du texte. Ni
// userId ni workspaceId : le contrôleur dérive l'identité du JWT + de l'espace.
export class CreateReplyFeedbackDto extends createZodDto(createReplyFeedbackSchema) {}
