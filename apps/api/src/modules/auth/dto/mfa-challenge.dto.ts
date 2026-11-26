import { createZodDto } from 'nestjs-zod'
import { mfaChallengeSchema } from '@bellum/contracts'

/** `{ mfaToken, code }` — POST /auth/2fa/challenge (second step of a 2FA login). */
export class MfaChallengeDto extends createZodDto(mfaChallengeSchema) {}
