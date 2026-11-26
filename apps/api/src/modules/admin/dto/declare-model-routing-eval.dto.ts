import { createZodDto } from 'nestjs-zod'
import { declareModelRoutingEvalInternalSchema } from '@bellum/contracts'

/** #2975 / #2440.82 — le schéma INTERNE (porte `declaredBy`) vit dans
 *  `@bellum/contracts` ; ce fichier ne fait que le brancher sur la
 *  validation HTTP, comme les autres DTO du module. Jamais le schéma
 *  navigateur : `declaredBy` vient de la session back-office, pas du
 *  formulaire — voir le docblock de `declareModelRoutingEvalInternalSchema`. */
export class DeclareModelRoutingEvalDto extends createZodDto(declareModelRoutingEvalInternalSchema) {}
