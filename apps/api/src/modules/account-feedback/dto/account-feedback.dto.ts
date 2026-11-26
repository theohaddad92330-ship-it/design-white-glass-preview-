import { createZodDto } from 'nestjs-zod'
import { createAccountFeedbackSchema } from '@bellum/contracts'

// Body de POST /accounts/:id/feedback — schéma partagé dans @bellum/contracts
// (vocabulaires target/verdict fermés, champs libres bornés). Ni userId ni
// workspaceId : le contrôleur dérive l'identité du JWT + du workspace actif.
export class CreateAccountFeedbackDto extends createZodDto(createAccountFeedbackSchema) {}
