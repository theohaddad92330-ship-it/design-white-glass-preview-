import { createZodDto } from 'nestjs-zod'
import { createIntroductionAuthorizationSchema } from '@bellum/contracts'

// Body de POST /contacts/:id/introduction-authorizations — schéma partagé
// dans @bellum/contracts (canal fermé, champs libres bornés). Ni
// workspaceId ni recordedBy : le contrôleur dérive l'identité du JWT + du
// workspace actif.
export class CreateIntroductionAuthorizationDto extends createZodDto(createIntroductionAuthorizationSchema) {}
