import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { marketMemoryGroundTruthJudgmentInputSchema } from '@bellum/contracts'

/**
 * #1622 — le corps de `POST internal/admin/market-memory-ground-truth/judgments`.
 *
 * Étend le contrat PARTAGÉ (`marketMemoryGroundTruthJudgmentInputSchema`,
 * `@bellum/contracts`) d'un seul champ, `judgedBy` — même patron que
 * `QueueActorDto.actor` (`admin-queues.controller.ts`) : c'est le proxy
 * serveur du back-office qui le renseigne depuis la session de l'opérateur
 * (`actorFromRequest`), jamais l'opérateur lui-même. `.extend()` conserve le
 * `.strict()` du contrat : aucun autre champ (une note libre, par exemple)
 * ne passe la validation.
 */
export const groundTruthJudgmentInputWithActorSchema = marketMemoryGroundTruthJudgmentInputSchema.extend({
  judgedBy: z.string().trim().min(1).max(200).optional(),
})

export class GroundTruthJudgmentInputDto extends createZodDto(groundTruthJudgmentInputWithActorSchema) {}
