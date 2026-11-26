import { z } from 'zod'

/**
 * #2455 — Contextes de travail enregistrés (LAU-FINAL-168).
 *
 * Un utilisateur qui travaille plusieurs marchés/BU/offres crée des variantes
 * de critères SANS modifier son profil principal (`profiles`/`esn_profiles`
 * restent intacts). L'objet WORK_CONTEXT porte les ~22 champs demandés ;
 * `reference_list` remplace `references`, mot réservé SQL. Table : `work_contexts`.
 */

export const workContextVisibilitySchema = z.enum(['personal', 'bu', 'group'])
export type WorkContextVisibility = z.infer<typeof workContextVisibilitySchema>

/** Les quatre types demandés : temporaire / enregistré / partagé / archivé. */
export const workContextStatusSchema = z.enum(['temporaire', 'enregistre', 'partage', 'archive'])
export type WorkContextStatus = z.infer<typeof workContextStatusSchema>

export const workContextSchema = z.object({
  context_id: z.string(),
  name: z.string(),
  owner: z.string(),
  workspace: z.string(),
  visibility: workContextVisibilitySchema,
  business_unit_id: z.string().nullable(),
  objective: z.string().nullable(),
  offer: z.string().nullable(),
  expertise: z.string().nullable(),
  technologies: z.array(z.string()),
  sectors: z.array(z.string()),
  territories: z.array(z.string()),
  company_types: z.array(z.string()),
  sizes: z.array(z.string()),
  delivery_model: z.string().nullable(),
  exclusions: z.array(z.string()),
  reference_list: z.array(z.string()),
  capacity: z.string().nullable(),
  data_layers: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number(),
  status: workContextStatusSchema,
})
export type WorkContext = z.infer<typeof workContextSchema>

/**
 * Corps de `POST /work-contexts`. Seuls `name` est requis — les autres champs
 * du marché restent optionnels (une valeur absente ne s'affiche jamais « 0 »,
 * elle est simplement omise). `status` par défaut `enregistre` ; le parcours
 * chat peut poser `temporaire` explicitement (#2455.3).
 */
export const createWorkContextSchema = z.object({
  name: z.string().trim().min(1).max(120),
  visibility: workContextVisibilitySchema.default('personal'),
  status: workContextStatusSchema.default('enregistre'),
  objective: z.string().trim().max(500).nullable().optional(),
  offer: z.string().trim().max(500).nullable().optional(),
  expertise: z.string().trim().max(500).nullable().optional(),
  technologies: z.array(z.string()).optional(),
  sectors: z.array(z.string()).optional(),
  territories: z.array(z.string()).optional(),
  company_types: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  delivery_model: z.string().trim().max(200).nullable().optional(),
  exclusions: z.array(z.string()).optional(),
  reference_list: z.array(z.string()).optional(),
  capacity: z.string().trim().max(200).nullable().optional(),
  data_layers: z.array(z.string()).optional(),
})
export type CreateWorkContext = z.infer<typeof createWorkContextSchema>

/** Réponse de `GET /work-contexts` — les contextes visibles pour l'appelant. */
export const workContextsResponseSchema = z.object({
  items: z.array(workContextSchema),
})
export type WorkContextsResponse = z.infer<typeof workContextsResponseSchema>

/**
 * Réponse de `POST /work-contexts/:id/activate` (#2455.5) — le contexte activé
 * pointe vers une conversation NEUVE, jamais le fil d'origine.
 */
export const activateWorkContextResponseSchema = z.object({
  work_context: workContextSchema,
  conversation_id: z.string(),
})
export type ActivateWorkContextResponse = z.infer<typeof activateWorkContextResponseSchema>

/**
 * #2455.6 — « Mise à jour du profil principal jamais automatique, diff
 * affiché avant ». Réponse de `GET /work-contexts/:id/profile-suggestion` :
 * `suggestion: null` quand rien ne se propose (usage pas encore régulier,
 * pas de divergence, ou contexte non personnel) — jamais une proposition
 * devinée, et jamais une écriture : ce n'est qu'un DIFF à afficher.
 */
export const workContextProfileSuggestionSchema = z
  .object({
    field: z.literal('target_sectors'),
    current: z.array(z.string()),
    suggested: z.array(z.string()),
  })
  .nullable()
export type WorkContextProfileSuggestion = z.infer<typeof workContextProfileSuggestionSchema>

export const workContextProfileSuggestionResponseSchema = z.object({
  suggestion: workContextProfileSuggestionSchema,
})
export type WorkContextProfileSuggestionResponse = z.infer<typeof workContextProfileSuggestionResponseSchema>
