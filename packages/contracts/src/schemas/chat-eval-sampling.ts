import { z } from 'zod'

/**
 * #2899 / #2443.10 / #2278.9 — LE RÉGLAGE D'ÉCHANTILLONNAGE DES CONVERSATIONS DE LAURA POUR
 * LES ÉVALS : OPT-IN PAR ESPACE, anonymisé AVANT stockage, corps de messages jamais. Un réglage
 * vit à un seul endroit (GA-26) : la colonne `workspaces.chat_eval_sampling_enabled`, jamais une
 * variable d'environnement. ALLUMÉ par défaut depuis #4173 (retour bêta 14/10/2026, revirement
 * assumé de la décision Louis du 11/10/2026 — « éteint par défaut ») ; un espace qui a déjà
 * tranché, dans un sens ou l'autre, garde son choix (`chat_eval_sampling_chosen_at`).
 */
export const chatEvalSamplingSettingSchema = z.object({
  enabled: z.boolean(),
  /** Propriétaire ou administrateur seul : l'API le re-vérifie (403 sinon). */
  canEdit: z.boolean(),
})
export type ChatEvalSamplingSetting = z.infer<typeof chatEvalSamplingSettingSchema>

export const updateChatEvalSamplingSchema = z.object({ enabled: z.boolean() }).strict()
export type UpdateChatEvalSampling = z.infer<typeof updateChatEvalSamplingSchema>
