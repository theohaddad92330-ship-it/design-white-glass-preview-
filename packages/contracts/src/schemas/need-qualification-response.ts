import { z } from 'zod'
import { NEED_QUALIFICATION_AXES } from './need-qualification-questions.js'

/**
 * `GET /projects/needs/:needId/qualification` — LE CORPS DE RÉPONSE.
 *
 * Assemble ce que rendent {@link needQualificationQuestions}
 * (`need-qualification-questions.ts`) et {@link needContradictions}
 * (`need-contradictions.ts`) SANS recalculer quoi que ce soit — même
 * discipline que {@link needVerdictResponseSchema} (`need-verdict.ts`), qui
 * sert de patron à ce fichier : un schéma Zod pour que la réponse HTTP se
 * valide au runtime, le TYPE inféré partagé par l'API et le web.
 */
const bilingualTextSchema = z.object({ fr: z.string(), en: z.string() })

export const needQualificationQuestionResponseSchema = z.object({
  axis: z.enum(NEED_QUALIFICATION_AXES),
  field: z.string(),
  question: bilingualTextSchema,
})

export const needContradictionResponseSchema = z.object({
  key: z.string(),
  label: bilingualTextSchema,
  arbitration: bilingualTextSchema,
})

export const needContradictionNotEvaluableResponseSchema = z.object({
  key: z.string(),
  reason: bilingualTextSchema,
})

export const needQualificationResponseSchema = z.object({
  questions: z.array(needQualificationQuestionResponseSchema),
  contradictions: z.array(needContradictionResponseSchema),
  notEvaluable: z.array(needContradictionNotEvaluableResponseSchema),
})
export type NeedQualificationResponse = z.infer<typeof needQualificationResponseSchema>
