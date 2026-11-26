import { createZodDto } from 'nestjs-zod'
import { onboardingReformulateRequestSchema } from '@bellum/contracts'

/** Body of `POST /onboarding/reformulate-answer` (#2060.9) — the question's
 *  label and the free-text answer the user just typed. Validated by the
 *  global ZodValidationPipe. */
export class ReformulateAnswerDto extends createZodDto(onboardingReformulateRequestSchema) {}
