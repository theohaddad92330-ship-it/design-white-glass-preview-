import { createZodDto } from 'nestjs-zod'
import { mfaCodeSchema } from '@bellum/contracts'

/** `{ code }` — used by POST /auth/2fa/verify and POST /auth/2fa/disable. */
export class MfaCodeDto extends createZodDto(mfaCodeSchema) {}
