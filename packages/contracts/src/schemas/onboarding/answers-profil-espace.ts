import { workspaceProfileSchema } from '../workspace-profile.js'

/**
 * #4270.1 (18/10) — le profil d'espace « forfait / conseil » (`workspace-profile.ts`).
 *
 * Optionnel (un client plus ancien reste valide) ; une valeur inconnue de ce
 * build dégrade en `null` — jamais un profil entier illisible pour un mot mal
 * écrit. `null` = aucun choix = le comportement d'avant.
 *
 * ⚠️ Bloc AJOUTÉ EN FIN du schéma composé, comme les précédents.
 */
export const WORKSPACE_PROFILE_ANSWER_FIELDS = {
  workspace_profile: workspaceProfileSchema.nullable().optional().catch(null),
}
