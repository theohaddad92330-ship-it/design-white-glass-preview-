import { createZodDto } from 'nestjs-zod'
import { esnPrefillRequestSchema } from '@bellum/contracts'

/** Body of `POST /esn-profile/prefill` — the ESN name typed at onboarding, plus
 *  an optional SIREN when the user picked an autocomplete suggestion (pins the
 *  match and skips the homonym risk). Validated by the global ZodValidationPipe. */
export class PrefillEsnProfileDto extends createZodDto(esnPrefillRequestSchema) {}
