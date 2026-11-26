import {
  conversationSummaryQuerySchema,
  correctConversationSummarySchema,
  createMemoryItemSchema,
  memoryLayerSchema,
  updateMemoryItemSchema,
  updateMemoryItemScopeSchema,
  userPreferencesPatchSchema,
} from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// "Long memory" DTOs (Théo P2). None carry `user_id`/`workspace_id` — the
// controller derives identity from the JWT + the resolved active workspace.

/**
 * Corps `POST /memory/facts`. Le schéma est PARTAGÉ (`@bellum/contracts`) avec
 * le client web : la nature (`kind`), l'origine (`origin`) et l'échéance
 * (`expiresAt`) de l'objet MemoryItem (restitution V2 §20) y sont optionnelles
 * et retombent sur les défauts historiques côté service.
 */
export const pinFactSchema = createMemoryItemSchema
export class PinFactDto extends createZodDto(pinFactSchema) {}

/**
 * #1916.21 — corps `PATCH /memory/facts/:id/scope`. La portée seule, validée par
 * l'énumération du contrat (`strict` : aucun autre champ). Le PROPRIÉTAIRE est
 * vérifié côté service contre l'utilisateur authentifié, jamais lu ici.
 */
export const updateFactScopeSchema = updateMemoryItemScopeSchema
export class UpdateFactScopeDto extends createZodDto(updateFactScopeSchema) {}

/**
 * #1916.19 / #1916.22 — corps `PATCH /memory/facts/:id` : le texte et/ou
 * l'échéance (`strict`, au moins l'un des deux). QUI peut modifier se vérifie
 * côté service contre l'utilisateur authentifié et son rôle résolu, jamais ici.
 */
export const updateFactSchema = updateMemoryItemSchema
export class UpdateFactDto extends createZodDto(updateFactSchema) {}

export const listFactsSchema = z.object({
  accountId: z.string().guid().nullable().optional(),
  /**
   * #1918.5 — le FIL dans lequel l'écran est ouvert, quand il l'est. Absent (la
   * carte de Réglages › Mémoire) : aucune mémoire « cette conversation » n'est
   * rendue — elle n'appartient pas à cet écran-là.
   */
  conversationId: z.string().trim().min(1).max(200).nullable().optional(),
})
export class ListFactsDto extends createZodDto(listFactsSchema) {}

/**
 * Paramètres de `DELETE /memory/ledger/:layer/:id`. La COUCHE est validée par le
 * contrat partagé : une couche inconnue est refusée à la porte plutôt que
 * cherchée dans une table devinée.
 */
export const forgetMemoryParamsSchema = z.object({
  layer: memoryLayerSchema,
  id: z.string().trim().min(1).max(200),
})
export class ForgetMemoryParamsDto extends createZodDto(forgetMemoryParamsSchema) {}

/**
 * #1955.30 — `GET /memory/summary` : la clé du fil OUVERT, pas d'identité (le
 * JETON la porte).
 */
export class GetConversationSummaryDto extends createZodDto(conversationSummaryQuerySchema) {}

/**
 * #1955.31 — corps `PATCH /memory/summary` : le texte corrigé, sur le MÊME fil
 * que la lecture (le contrat partagé, un seul schéma pour les deux clés).
 */
export class CorrectConversationSummaryDto extends createZodDto(correctConversationSummarySchema) {}

export const patchPreferencesSchema = z.object({
  // Free-form bag — the copilot reads whatever keys the product surfaces (tone,
  // default sectors, …). Values are unknown; the caller owns the shape.
  // #1928.2/.3/.5/.6 — SAUF les quatre réglages de réponse, validés par le
  // contrat partagé : une valeur inconnue est refusée à la porte (400) plutôt que
  // stockée puis ignorée en silence par le prompt.
  preferences: userPreferencesPatchSchema,
})
export class PatchPreferencesDto extends createZodDto(patchPreferencesSchema) {}
